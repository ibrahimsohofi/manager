# Phone Scanner — Implementation Plan (chunk by chunk)

Spec: "Phone Scanner — Remote Barcode Scanning for QrSale" (supersedes ROADMAP_V2 §10 where they conflict).
Scope: `sales_manager` (API in `sales_manager/server/`, laptop UI in `sales_manager/src/`) and the
product lookup route in both product APIs (`products_manager/backend/server.js` and its mirror `sales_manager/server.js`).

Principle: reuse what exists, keep all business logic on the laptop, and use the phone only as a remote input device.

---

## 1. Decisions

1. **Pairing token issued by the server:** new `POST /api/remote-scanner/pair`. The server validates tokens, so they must come from `issueToken()`. The laptop only stores the token (`localStorage`).
   Only the laptop itself may pair: the request must come from loopback or one of the PC's own IPs. Otherwise any phone on the Wi-Fi could pair itself. Override: `SCANNER_ALLOW_LAN_PAIRING=true`.
2. **Pairing URL:** `https://<laptop-ip>:3443/phone/#t=<token>`. The token sits in the **hash**, so it is never sent in a request and never logged. The phone saves it, then removes it from the address bar.
3. **`/result`:** `POST` = laptop answers a scan (existing). `GET` = phone asks what happened to a `clientScanId` (new, uses `getScanResult`).
4. **Scan queue stays in QrSale** (existing `enqueueScan`, sequential). The server only relays. `enqueueScan` now returns a Promise with the structured result.
5. **No phone queue:** scans are refused while the PC is offline. While one scan is in flight, new reads are ignored (the camera reads the code again a moment later).
6. **EAN-13:** 13 digits **with a valid check digit** go to the barcode lookup (`?by=barcode`, exact match). Any other digit string is a product ID, as today.
7. **Languages:** the phone page is in French (spec messages). The laptop UI (dialog, status) is in French and Arabic.
8. **HTTPS:** the existing self-signed cert stays the default. mkcert is optional: put the files in `server/certs/` with the same names (§3).
9. **CORS:** the global `origin: '*'` is left unchanged here (already tracked in todos, Phase 5). The phone page is same-origin, so it needs no CORS.

### Scan result contract

```text
Laptop -> POST /result  { t, scanId, status, ok, locked, text, cart: { lines, units, amount } }
          status = ok | invalid | not_found | out_of_stock | locked | error
Phone  <- 200 { status: "done", result: <status>, ok, locked, text, cart }
          202 { status: "uncertain", reason }      (PC slower than 12 s / tab closed)
          409 { error: "pc_offline" }              (no laptop listening, not queued)
          + SSE "result" { clientScanId, ... }      (late answer after an uncertain reply)
```

### Phone messages (French)

| Case | Title | Detail |
|---|---|---|
| SSE status pc = true | Caisse connectée | device name |
| SSE status pc = false / 409 | Caisse non connectée | scan not sent |
| result ok | Produit envoyé | laptop text + cart summary |
| result locked | Vente en cours | — |
| result invalid | Code invalide | — |
| result not_found / out_of_stock / error | Produit introuvable / Stock insuffisant / Erreur caisse | laptop text |
| 202, or 3 attempts failed | Envoyé, vérifiez l'écran | updated if a late SSE result arrives |

---

## 2. Chunks

Chunks 1–4 are complete and have been removed from the plan.

### Chunk 5 — Laptop pairing and live link (verification pending)
- [ ] Verify the existing hook, pairing dialog, QrSale phone button and French/Arabic translations against a fake relay; check translation parity.
- [ ] Frontend build and touched-file lint.

### Chunk 6 — Reliability and verification
- [ ] Temporary end-to-end script (fake PC and fake phones): dedup under retries, locked handling, PC disconnect gives uncertain, reconnect, 2 phones each receiving only their own results, revoke closes streams, nothing queued while offline.
- [ ] Frontend build, biome lint (touched files only), render check of QrSale and `/phone/`.
- [ ] Remove the temporary scripts. Update this file and the todos.
- [ ] **Manual (on your devices):** Android Chrome, iPhone Safari, router without internet, phone hotspot, Windows firewall, certificate trust, EAN-13 and QR products, full sale.

---

## 3. Setup notes (for the shop laptop)

- **Start:** `cd sales_manager && bun run dev`. The API prints `https://<ip>:3443/phone/` for each network.
- **Windows firewall** (Private profile, admin prompt):
  `netsh advfirewall firewall add rule name="QrSale phone scanner" dir=in action=allow protocol=TCP localport=3443 profile=private`
- **Self-signed certificate (default):** created once in `sales_manager/server/certs/`. Each phone shows a warning the first time; choose "Continue / Visit website".
- **mkcert (no warnings):** `mkcert -install`, then in `sales_manager/server/certs/`:
  `mkcert -key-file scanner-key.pem -cert-file scanner-cert.pem <laptop-ip> localhost`.
  Install the mkcert root CA on each phone (iPhone: Settings > General > About > Certificate Trust Settings).
- **Ports:** API HTTP `3001` (laptop only), HTTPS `3443` (phones). Override with `SCANNER_HTTPS_PORT`; disable with `SCANNER_HTTPS=false`.
- Reserve a fixed IP for the laptop in the router (DHCP reservation). If the IP changes, open the dialog again; it rebuilds the QR.
