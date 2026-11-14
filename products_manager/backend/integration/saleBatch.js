// Atomic + idempotent multi-line sale for the sales_manager QR checkout.
// POST /api/integration/sale/batch
// Body: {
//   ticket_number: "TKT-20261101-153000-ABC",
//   idempotency_key: "client generated key",   (optional but recommended)
//   date: "2026-11-01", payment_method: "cash", customer_id: null, notes: "",
//   items: [{ product_id, quantity, price, discount? }]
// }
// All lines are processed in ONE transaction with row locks (SELECT ... FOR UPDATE):
// either every stock decrement is committed or none is.
//
// Shared by products_manager/backend/server.js (CommonJS) and the standalone
// mirror sales_manager/server.js (ESM import of this CommonJS module).

const ALLOWED_PAYMENT_METHODS = ["cash", "credit", "check", "bank_transfer"];
const MAX_LINES = 200;

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const localDateString = (d = new Date()) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const ensureIntegrationTables = async (pool) => {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS integration_requests (
        idempotency_key VARCHAR(100) NOT NULL PRIMARY KEY,
        ticket_number VARCHAR(100) NOT NULL,
        response_json LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_integration_requests_ticket (ticket_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
};

const findStoredResponse = async (executor, idempotencyKey) => {
    const [rows] = await executor.execute(
        "SELECT response_json FROM integration_requests WHERE idempotency_key = ?",
        [idempotencyKey]
    );
    if (rows.length === 0) return null;
    try {
        return JSON.parse(rows[0].response_json);
    } catch {
        return null;
    }
};

// Validate + normalise the request body. Returns { error } or { value }.
const normaliseBody = (body = {}) => {
    const {items, ticket_number, idempotency_key, date, payment_method = "cash", customer_id = null, notes = ""} = body;

    if (!ticket_number || typeof ticket_number !== "string" || ticket_number.length > 80) {
        return {error: {status: 400, body: {success: false, error: "Missing or invalid ticket_number"}}};
    }
    if (idempotency_key !== undefined && idempotency_key !== null && (typeof idempotency_key !== "string" || idempotency_key.length > 100)) {
        return {error: {status: 400, body: {success: false, error: "Invalid idempotency_key"}}};
    }
    if (!Array.isArray(items) || items.length === 0) {
        return {error: {status: 400, body: {success: false, error: "items must be a non-empty array"}}};
    }
    if (items.length > MAX_LINES) {
        return {error: {status: 400, body: {success: false, error: `Too many lines (max ${MAX_LINES})`}}};
    }

    const details = [];
    const lines = items.map((item, index) => {
        const productId = Number.parseInt(item?.product_id, 10);
        const quantity = Number.parseInt(item?.quantity, 10);
        const price = round2(item?.price);
        const discount = round2(item?.discount);
        if (!Number.isSafeInteger(productId) || productId <= 0) details.push({index, error: "Invalid product_id"});
        if (!Number.isSafeInteger(quantity) || quantity <= 0) details.push({index, error: "Quantity must be greater than 0"});
        if (!(price > 0)) details.push({index, error: "Price must be greater than 0"});
        if (discount < 0 || discount >= price * quantity) details.push({index, error: "Invalid discount"});
        return {index, product_id: productId, quantity, price, discount};
    });

    if (details.length > 0) {
        return {error: {status: 400, body: {success: false, error: "Invalid items", details}}};
    }

    return {
        value: {
            lines,
            ticketNumber: ticket_number,
            idempotencyKey: idempotency_key || null,
            saleDate: typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDateString(),
            method: ALLOWED_PAYMENT_METHODS.includes(payment_method) ? payment_method : "cash",
            customerId: Number.isSafeInteger(Number(customer_id)) && Number(customer_id) > 0 ? Number(customer_id) : null,
            notes: String(notes || "").slice(0, 500)
        }
    };
};

const createSaleBatchHandler = (getPool) => async (req, res) => {
    const pool = typeof getPool === "function" ? getPool() : getPool;
    const parsed = normaliseBody(req.body);
    if (parsed.error) {
        return res.status(parsed.error.status).json(parsed.error.body);
    }
    const {lines, ticketNumber, idempotencyKey, saleDate, method, customerId, notes} = parsed.value;

    // Fast path: this request was already committed -> replay the stored response.
    if (idempotencyKey) {
        try {
            const stored = await findStoredResponse(pool, idempotencyKey);
            if (stored) return res.json({...stored, replayed: true});
        } catch (error) {
            console.error("Idempotency lookup failed:", error);
            return res.status(500).json({success: false, error: error.message});
        }
    }

    let connection;
    try {
        connection = await pool.getConnection();
    } catch (error) {
        return res.status(503).json({success: false, error: "Database unavailable", details: error.message});
    }

    try {
        await connection.beginTransaction();

        // Aggregate quantities per product and lock rows in a stable order (avoids deadlocks).
        const requested = new Map();
        for (const line of lines) {
            requested.set(line.product_id, (requested.get(line.product_id) || 0) + line.quantity);
        }
        const productIds = [...requested.keys()].sort((a, b) => a - b);
        const placeholders = productIds.map(() => "?").join(",");
        const [productRows] = await connection.execute(
            `SELECT p.id, p.name, p.remaining_stock, p.stock_quantity, p.min_stock_level, p.is_active,
                    c.name AS category_name
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.id IN (${placeholders})
             ORDER BY p.id
             FOR UPDATE`,
            productIds
        );
        const products = new Map(productRows.map((row) => [Number(row.id), row]));

        const stockErrors = [];
        for (const productId of productIds) {
            const product = products.get(productId);
            const wanted = requested.get(productId);
            if (!product || product.is_active === 0 || product.is_active === false) {
                stockErrors.push({product_id: productId, requested: wanted, available: 0, error: "Product not found"});
                continue;
            }
            const available = Number(product.remaining_stock ?? product.stock_quantity ?? 0);
            if (available < wanted) {
                stockErrors.push({product_id: productId, product_name: product.name, requested: wanted, available, error: "Insufficient stock"});
            }
        }

        if (stockErrors.length > 0) {
            await connection.rollback();
            return res.status(409).json({success: false, error: "Insufficient stock", details: stockErrors});
        }

        const processed = [];
        for (const line of lines) {
            const product = products.get(line.product_id);
            const saleNumber = `${ticketNumber}-${String(line.index + 1).padStart(2, "0")}`;
            const totalPrice = round2(line.price * line.quantity - line.discount);
            const category = product.category_name || "General";

            await connection.execute(
                `INSERT INTO sales (
                   sale_number, date, customer_id, product_id, productName, price, quantity, category,
                   totalPrice, discount, tax_amount, payment_method, notes
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
                [saleNumber, saleDate, customerId, line.product_id, product.name, line.price, line.quantity, category, totalPrice, line.discount, method, notes]
            );

            await connection.execute(
                "UPDATE products SET remaining_stock = remaining_stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                [line.quantity, line.product_id]
            );

            await connection.execute(
                `INSERT INTO stock_movements (
                   product_id, movement_type, quantity, reason, reference_type, reference_number, notes, created_by
                 ) VALUES (?, 'OUT', ?, 'Sale', 'ticket', ?, ?, 'sales_system')`,
                [line.product_id, line.quantity, ticketNumber, `Ticket ${ticketNumber} line ${line.index + 1}: ${line.quantity} x ${product.name}`]
            );

            processed.push({
                index: line.index,
                sale_number: saleNumber,
                product_id: line.product_id,
                product_name: product.name,
                category,
                quantity: line.quantity,
                price: line.price,
                discount: line.discount,
                total_price: totalPrice
            });
        }

        // Read the new stock levels inside the transaction (rows are still locked).
        const [updatedRows] = await connection.execute(
            `SELECT id, remaining_stock, min_stock_level FROM products WHERE id IN (${placeholders})`,
            productIds
        );
        const inventory = updatedRows.map((row) => ({
            product_id: Number(row.id),
            new_stock: Number(row.remaining_stock),
            is_low_stock: Number(row.remaining_stock) <= Number(row.min_stock_level || 0)
        }));

        const responseBody = {
            success: true,
            ticket_number: ticketNumber,
            date: saleDate,
            payment_method: method,
            items: processed,
            inventory_update: inventory,
            total_units: processed.reduce((sum, p) => sum + p.quantity, 0),
            total_amount: round2(processed.reduce((sum, p) => sum + p.total_price, 0))
        };

        if (idempotencyKey) {
            // Duplicate concurrent request -> ER_DUP_ENTRY -> whole transaction rolls back.
            await connection.execute(
                "INSERT INTO integration_requests (idempotency_key, ticket_number, response_json) VALUES (?, ?, ?)",
                [idempotencyKey, ticketNumber, JSON.stringify(responseBody)]
            );
        }

        await connection.commit();
        return res.status(201).json(responseBody);
    } catch (error) {
        await connection.rollback().catch(() => {});
        if (error && error.code === "ER_DUP_ENTRY" && idempotencyKey) {
            // Another request with the same key committed first: replay it.
            const stored = await findStoredResponse(pool, idempotencyKey).catch(() => null);
            if (stored) return res.json({...stored, replayed: true});
            return res.status(409).json({success: false, error: "Duplicate request in progress, retry later"});
        }
        console.error("Error recording batch sale:", error);
        return res.status(500).json({success: false, error: error.message});
    } finally {
        connection.release();
    }
};

module.exports = {
    createSaleBatchHandler,
    ensureIntegrationTables,
    normaliseBody
};
