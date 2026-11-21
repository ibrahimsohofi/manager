// TEMPORARY end-to-end check of the phone scanner relay (PHONE_SCANNER_PLAN.md, chunk 6).
// Real router + real relay module, fake PCs and fake phones over real HTTP / SSE / HTTPS.
// Run: cd sales_manager/server && node tmp_e2e_scanner.mjs   (delete this file afterwards)
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // self-signed scanner certificate
process.env.SCANNER_HTTPS_PORT = "34431";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const CERT_DIR = path.join(__dirname, "certs");
const hadData = fs.existsSync(DATA_DIR);
const hadCerts = fs.existsSync(CERT_DIR);

const { default: express } = await import("express");
const { default: router } = await import("./routes/remoteScanner.js");
const { startScannerHttps, getScannerHttpsState } = await import("./utils/lanHttps.js");

const app = express();
app.use(express.json());
app.use("/api/remote-scanner", router);
app.use("/phone", express.static(path.join(__dirname, "phone"), { index: "index.html" }));
const server = await new Promise((resolve) => {
  const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}/api/remote-scanner`;

// ---------- tiny helpers ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const test = async (name, fn) => {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    results.push({ name, ok: false });
    console.log(`  FAIL  ${name}\n        ${error.stack?.split("\n").slice(0, 3).join("\n        ")}`);
  }
};

const get = async (p) => {
  const res = await fetch(`${BASE}${p}`);
  return { status: res.status, body: await res.json().catch(() => null) };
};
const post = async (p, body) => {
  const res = await fetch(`${BASE}${p}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

// Minimal SSE client: records every event, lets the test wait for one.
const sse = (url) => {
  const controller = new AbortController();
  const events = [];
  const consumed = new Set();
  const listeners = new Set();
  const state = { status: 0, closed: false };
  const notify = () => {
    for (const fn of [...listeners]) fn();
  };
  const ready = fetch(url, { signal: controller.signal })
    .then(async (res) => {
      state.status = res.status;
      if (res.status !== 200) {
        state.body = await res.json().catch(() => null);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let index = buffer.indexOf("\n\n");
            while (index >= 0) {
              const block = buffer.slice(0, index);
              buffer = buffer.slice(index + 2);
              let event = "message";
              let data = "";
              for (const line of block.split("\n")) {
                if (line.startsWith("event: ")) event = line.slice(7);
                else if (line.startsWith("data: ")) data += line.slice(6);
              }
              if (data) {
                events.push({ event, data: JSON.parse(data) });
                notify();
              }
              index = buffer.indexOf("\n\n");
            }
          }
        } catch {
          // aborted
        }
        state.closed = true;
        notify();
      })();
    })
    .catch(() => {
      state.closed = true;
    });

  const find = (event, predicate) =>
    events.findIndex(
      (entry, i) => !consumed.has(i) && entry.event === event && (!predicate || predicate(entry.data)),
    );

  return {
    ready: ready.then(() => state.status),
    state,
    events,
    // Wait for the next unconsumed `event` (optionally matching predicate).
    next(event, predicate, timeout = 3000) {
      return new Promise((resolve, reject) => {
        const check = () => {
          const i = find(event, predicate);
          if (i >= 0) {
            consumed.add(i);
            listeners.delete(check);
            clearTimeout(timer);
            resolve(events[i].data);
          }
        };
        const timer = setTimeout(() => {
          listeners.delete(check);
          reject(new Error(`timeout waiting for SSE "${event}"`));
        }, timeout);
        listeners.add(check);
        check();
      });
    },
    // Assert that no matching event arrives during `ms`.
    async none(event, predicate, ms = 600) {
      await sleep(ms);
      const i = find(event, predicate);
      assert.equal(i, -1, `unexpected SSE "${event}": ${i >= 0 ? JSON.stringify(events[i].data) : ""}`);
    },
    waitClosed(timeout = 3000) {
      return new Promise((resolve, reject) => {
        if (state.closed) return resolve();
        const check = () => {
          if (state.closed) {
            listeners.delete(check);
            clearTimeout(timer);
            resolve();
          }
        };
        const timer = setTimeout(() => reject(new Error("stream did not close")), timeout);
        listeners.add(check);
      });
    },
    close() {
      controller.abort();
    },
  };
};

const pcStream = (t) => sse(`${BASE}/pc-stream?t=${encodeURIComponent(t)}`);
const phoneStream = (t, phoneId, name) =>
  sse(`${BASE}/phone-stream?${new URLSearchParams({ t, phoneId, name })}`);
const scan = (t, phoneId, code, clientScanId) => post("/scan", { t, phoneId, code, clientScanId });
const answer = (t, scanId, extra) => post("/result", { t, scanId, ...extra });

// POST /pair from a chosen local address (127.0.0.2 = "not this PC" for the relay).
const pairFrom = (localAddress) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: PORT, path: "/api/remote-scanner/pair", method: "POST", localAddress },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(raw || "{}") }));
      },
    );
    req.on("error", reject);
    req.end();
  });

const PHONE_A = "phoneAAAA01";
const PHONE_B = "phoneBBBB02";
const CART = { lines: 1, units: 1, amount: 12.5 };
let token = "";
let pc = null;
let phoneA = null;
let phoneB = null;

console.log(`\nPhone scanner relay E2E on ${BASE}\n`);

// ---------- pairing + validation ----------

await test("pair: loopback gets a 32-char token", async () => {
  const { status, body } = await post("/pair");
  assert.equal(status, 200);
  assert.match(body.token, /^[A-Za-z0-9_-]{32}$/);
  token = body.token;
});

await test("pair: a non-local peer is refused (403 local_only), override allows it", async () => {
  const refused = await pairFrom("127.0.0.2");
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error, "local_only");
  process.env.SCANNER_ALLOW_LAN_PAIRING = "true";
  const allowed = await pairFrom("127.0.0.2");
  delete process.env.SCANNER_ALLOW_LAN_PAIRING;
  assert.equal(allowed.status, 200);
  assert.match(allowed.body.token, /^[A-Za-z0-9_-]{32}$/);
});

await test("tokens: only SHA-256 hashes are stored on disk", async () => {
  const raw = fs.readFileSync(path.join(DATA_DIR, "remote-scanner-tokens.json"), "utf8");
  assert.ok(!raw.includes(token), "raw token found in the tokens file");
  const { tokens } = JSON.parse(raw);
  assert.ok(tokens.length >= 2);
  for (const entry of tokens) assert.match(entry.hash, /^[a-f0-9]{64}$/);
});

await test("validation: unknown / malformed token, bad phoneId, empty code, bad scan id", async () => {
  assert.deepEqual((await get("/status?t=short")).body?.error, "invalid_token");
  const forged = "A".repeat(32);
  assert.equal((await get(`/status?t=${forged}`)).status, 400);
  const badPc = pcStream(forged);
  assert.equal(await badPc.ready, 400);
  const badPhone = await scan(token, "x", "125", "scanid0001");
  assert.equal(badPhone.status, 400);
  assert.equal(badPhone.body.error, "invalid_phone_id");
  const empty = await scan(token, PHONE_A, "   ", "scanid0002");
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error, "empty_code");
  const badId = await get(`/result?${new URLSearchParams({ t: token, phoneId: PHONE_A, clientScanId: "x" })}`);
  assert.equal(badId.status, 400);
  const unknown = await get(
    `/result?${new URLSearchParams({ t: token, phoneId: PHONE_A, clientScanId: "neverSent01" })}`,
  );
  assert.equal(unknown.status, 404);
  assert.equal((await answer(token, "nope", { status: "ok" })).body.delivered, false);
});

// ---------- offline: refused, never queued ----------

await test("offline: phone sees pc=false, scan is refused with 409 pc_offline", async () => {
  phoneA = phoneStream(token, PHONE_A, "Téléphone Jamal");
  assert.equal(await phoneA.ready, 200);
  assert.deepEqual(await phoneA.next("status"), { pc: false });
  const res = await scan(token, PHONE_A, "125", "offline0001");
  assert.equal(res.status, 409);
  assert.equal(res.body.error, "pc_offline");
});

await test("PC connects: hello lists the phone, phone sees pc=true, nothing queued arrives", async () => {
  pc = pcStream(token);
  assert.equal(await pc.ready, 200);
  const hello = await pc.next("hello");
  assert.equal(hello.phones.length, 1);
  assert.equal(hello.phones[0].id, PHONE_A);
  assert.equal(hello.phones[0].name, "Téléphone Jamal");
  assert.deepEqual(await phoneA.next("status"), { pc: true });
  await pc.none("scan");
  assert.deepEqual((await get(`/status?t=${token}`)).body, { success: true, pc: true, phones: 1 });
});

// ---------- normal scan ----------

await test("ok: scan reaches the PC once, phone gets done + cart (HTTP and SSE)", async () => {
  const pending = scan(token, PHONE_A, " 125 ", "okScan00001");
  const event = await pc.next("scan");
  assert.equal(event.code, "125");
  assert.deepEqual(event.phone, { id: PHONE_A, name: "Téléphone Jamal" });
  const delivered = await answer(token, event.scanId, { status: "ok", ok: true, text: "Marteau ajouté", cart: CART });
  assert.equal(delivered.body.delivered, true);
  const res = await pending;
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    success: true,
    status: "done",
    result: "ok",
    ok: true,
    locked: false,
    text: "Marteau ajouté",
    cart: CART,
  });
  const late = await phoneA.next("result", (d) => d.clientScanId === "okScan00001");
  assert.equal(late.result, "ok");
  // A second answer for the same scan is ignored.
  assert.equal((await answer(token, event.scanId, { status: "error" })).body.delivered, false);
  // PC sees the scan counter go up.
  const phones = await pc.next("phones", (d) => d.phones[0]?.scans === 1);
  assert.ok(phones.phones[0].lastScanAt);
});

// ---------- dedup ----------

await test("dedup: 3 concurrent retries + 1 late retry = 1 PC scan, same answer for all", async () => {
  const id = "dedupScan01";
  const tries = [scan(token, PHONE_A, "200", id), scan(token, PHONE_A, "200", id), scan(token, PHONE_A, "200", id)];
  const event = await pc.next("scan");
  await pc.none("scan", null, 400);
  await answer(token, event.scanId, { status: "out_of_stock", text: "Stock insuffisant: Vis (2)", cart: CART });
  const answers = await Promise.all(tries);
  for (const res of answers) {
    assert.equal(res.status, 200);
    assert.equal(res.body.result, "out_of_stock");
    assert.equal(res.body.ok, false);
  }
  const lateRetry = await scan(token, PHONE_A, "200", id);
  assert.equal(lateRetry.body.result, "out_of_stock");
  await pc.none("scan", null, 300);
  const polled = await get(`/result?${new URLSearchParams({ t: token, phoneId: PHONE_A, clientScanId: id })}`);
  assert.equal(polled.status, 200);
  assert.equal(polled.body.result, "out_of_stock");
});

// ---------- locked + status contract ----------

await test("locked: status wins over contradictory ok/locked flags", async () => {
  const pending = scan(token, PHONE_A, "125", "lockedScan1");
  const event = await pc.next("scan");
  await answer(token, event.scanId, { status: "locked", ok: true, locked: false, text: "" });
  const res = await pending;
  assert.equal(res.body.result, "locked");
  assert.equal(res.body.ok, false);
  assert.equal(res.body.locked, true);
});

await test("contract: legacy ok flag, unknown status, text sanitised + capped", async () => {
  const p1 = scan(token, PHONE_A, "1", "legacyScan1");
  const e1 = await pc.next("scan");
  await answer(token, e1.scanId, { ok: true, text: "a\u0000b\n\n  c" });
  const r1 = await p1;
  assert.equal(r1.body.result, "ok");
  assert.equal(r1.body.text, "a b c");
  assert.equal(r1.body.cart, null);

  const p2 = scan(token, PHONE_A, "2", "legacyScan2");
  const e2 = await pc.next("scan");
  await answer(token, e2.scanId, { status: "weird", locked: true, text: "x".repeat(900) });
  const r2 = await p2;
  assert.equal(r2.body.result, "locked");
  assert.equal(r2.body.text.length, 300);
});

// ---------- two phones ----------

await test("2 phones: each receives only its own SSE results, /result is per phone", async () => {
  phoneB = phoneStream(token, PHONE_B, "iPhone");
  assert.equal(await phoneB.ready, 200);
  assert.deepEqual(await phoneB.next("status"), { pc: true });
  await pc.next("phones", (d) => d.phones.length === 2);

  const pa = scan(token, PHONE_A, "10", "aOnlyScan01");
  const pb = scan(token, PHONE_B, "20", "bOnlyScan01");
  const first = await pc.next("scan");
  const second = await pc.next("scan");
  for (const event of [first, second]) {
    await answer(token, event.scanId, { status: "ok", text: `code ${event.code}`, cart: CART });
  }
  assert.equal((await pa).body.text, "code 10");
  assert.equal((await pb).body.text, "code 20");
  await phoneA.next("result", (d) => d.clientScanId === "aOnlyScan01");
  await phoneB.next("result", (d) => d.clientScanId === "bOnlyScan01");
  await phoneA.none("result", (d) => d.clientScanId === "bOnlyScan01", 200);
  await phoneB.none("result", (d) => d.clientScanId === "aOnlyScan01", 200);
  const cross = await get(`/result?${new URLSearchParams({ t: token, phoneId: PHONE_B, clientScanId: "aOnlyScan01" })}`);
  assert.equal(cross.status, 404);
});

// ---------- PC disconnect / reconnect ----------

await test("PC tab closes mid-scan: uncertain (pc_offline) over HTTP, SSE and GET /result", async () => {
  const pending = scan(token, PHONE_A, "125", "pcGoneScan1");
  await pc.next("scan");
  pc.close();
  const res = await pending;
  assert.equal(res.status, 202);
  assert.deepEqual(res.body, { success: true, status: "uncertain", reason: "pc_offline" });
  const late = await phoneA.next("result", (d) => d.clientScanId === "pcGoneScan1");
  assert.equal(late.status, "uncertain");
  assert.deepEqual(await phoneA.next("status"), { pc: false });
  assert.deepEqual(await phoneB.next("status"), { pc: false });
  const polled = await get(`/result?${new URLSearchParams({ t: token, phoneId: PHONE_A, clientScanId: "pcGoneScan1" })}`);
  assert.equal(polled.status, 202);
  assert.equal(polled.body.reason, "pc_offline");
  // A retry of the same scan is not dispatched again.
  const retry = await scan(token, PHONE_A, "125", "pcGoneScan1");
  assert.equal(retry.status, 202);
});

await test("still offline: new scan refused; on reconnect nothing queued is delivered", async () => {
  assert.equal((await scan(token, PHONE_A, "125", "whileOff001")).status, 409);
  pc = pcStream(token);
  assert.equal(await pc.ready, 200);
  const hello = await pc.next("hello");
  assert.equal(hello.phones.length, 2);
  assert.deepEqual(await phoneA.next("status"), { pc: true });
  await pc.none("scan");
});

await test("reconnected PC answers normally", async () => {
  const pending = scan(token, PHONE_A, "125", "afterRecon1");
  const event = await pc.next("scan");
  await answer(token, event.scanId, { status: "ok", text: "ok", cart: CART });
  assert.equal((await pending).body.result, "ok");
});

await test("2 PC tabs: the newest tab receives scans; closing it falls back to the older one", async () => {
  const pc2 = pcStream(token);
  await pc2.ready;
  await pc2.next("hello");
  const p1 = scan(token, PHONE_A, "301", "twoTabs0001");
  const e1 = await pc2.next("scan");
  await pc.none("scan", null, 200);
  await answer(token, e1.scanId, { status: "ok", cart: CART });
  assert.equal((await p1).body.result, "ok");
  pc2.close();
  await sleep(150);
  const p2 = scan(token, PHONE_A, "302", "twoTabs0002");
  const e2 = await pc.next("scan");
  assert.equal(e2.code, "302");
  await answer(token, e2.scanId, { status: "not_found", text: "Produit #302 introuvable" });
  assert.equal((await p2).body.result, "not_found");
});

// ---------- slow PC: timeout then late answer ----------

await test("slow PC (>12 s): 202 timeout, GET /result pending, late answer via SSE + GET", async () => {
  const id = "slowScan001";
  const started = Date.now();
  const pending = scan(token, PHONE_A, "125", id);
  const event = await pc.next("scan");
  const res = await pending;
  const waited = Date.now() - started;
  assert.equal(res.status, 202);
  assert.equal(res.body.reason, "timeout");
  assert.ok(waited >= 11500 && waited < 14000, `waited ${waited} ms`);
  const q = new URLSearchParams({ t: token, phoneId: PHONE_A, clientScanId: id });
  assert.deepEqual((await get(`/result?${q}`)).body, { success: true, status: "pending" });
  assert.equal((await answer(token, event.scanId, { status: "ok", text: "tard", cart: CART })).body.delivered, true);
  const late = await phoneA.next("result", (d) => d.clientScanId === id);
  assert.equal(late.status, "done");
  assert.equal(late.text, "tard");
  assert.equal((await get(`/result?${q}`)).body.result, "ok");
});

// ---------- revoke ----------

await test("revoke: pending scan -> uncertain(revoked), every stream gets 'revoked' and closes", async () => {
  const pending = scan(token, PHONE_A, "125", "revokeScan1");
  await pc.next("scan");
  const revoked = await post("/revoke", { t: token });
  assert.deepEqual(revoked.body, { success: true, revoked: true });
  const res = await pending;
  assert.equal(res.status, 202);
  assert.equal(res.body.reason, "revoked");
  for (const stream of [pc, phoneA, phoneB]) {
    await stream.next("revoked");
    await stream.waitClosed();
  }
  assert.equal((await get(`/status?t=${token}`)).status, 400);
  assert.equal(await phoneStream(token, PHONE_A, "x").ready, 400);
  assert.equal((await scan(token, PHONE_A, "125", "afterRevok1")).status, 400);
  assert.equal((await post("/revoke", { t: token })).status, 400);
});

await test("new code after revoke works end to end", async () => {
  token = (await post("/pair")).body.token;
  pc = pcStream(token);
  await pc.ready;
  await pc.next("hello");
  const pending = scan(token, PHONE_A, "6111234567896", "newCode0001");
  const event = await pc.next("scan");
  assert.equal(event.code, "6111234567896");
  await answer(token, event.scanId, { status: "ok", cart: CART });
  assert.equal((await pending).body.result, "ok");
  pc.close();
});

// ---------- HTTPS listener (phones) shares the same sessions ----------

await test("HTTPS: self-signed cert created, /phone/ served, same relay state as HTTP", async () => {
  await startScannerHttps(app);
  const state = getScannerHttpsState();
  assert.equal(state.enabled, true, `https not started: ${state.error}`);
  assert.ok(fs.existsSync(path.join(CERT_DIR, "scanner-cert.pem")));
  const page = await fetch("https://127.0.0.1:34431/phone/");
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes("phone.js") && html.includes('lang="fr"'));
  const js = await fetch("https://127.0.0.1:34431/phone/html5-qrcode.min.js");
  assert.equal(js.status, 200);
  const status = await fetch(`https://127.0.0.1:34431/api/remote-scanner/status?t=${token}`);
  assert.equal(status.status, 200);
  const info = await get("/info");
  assert.equal(info.body.https.enabled, true);
  assert.equal(info.body.https.port, 34431);
});

// ---------- summary + cleanup ----------

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (!hadData) fs.rmSync(DATA_DIR, { recursive: true, force: true });
if (!hadCerts) fs.rmSync(CERT_DIR, { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
