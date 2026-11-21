import {getDatabase} from '../config/database.js';
export const getAllOutOfStock = async (req, res) => {
    try {
        const db = getDatabase()
        const query = `SELECT * FROM products WHERE stock_quantity=0`; 
        
        const outOfStockProducts = db.all(query);
        console.log(awadb.run(query,[]))
        res.json(outOfStockProducts); 
    } catch (error) {
        console.error('Error getting products:', error);
        // Return empty array when database is not available
        res.json(["none"]);
    }
}
