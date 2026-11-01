# Products Manager

Product catalogue and inventory module of the **SOHOFI BRICO** suite.
React 18 + TypeScript frontend with an Express + MySQL API, built for hardware stores
and drugstores in Morocco.

![React](https://img.shields.io/badge/React-18.3.1-149eca)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6)
![Vite](https://img.shields.io/badge/Vite-6.3-646cff)
![Tailwind](https://img.shields.io/badge/Tailwind-3.4-38bdf8)

> Part of a monorepo. See the [root README](../README.md) for the full setup,
> and [`backend/README.md`](./backend/README.md) for the API reference.

---

## Features

### Catalogue
- Create, edit, duplicate and delete products
- Categories with French and Arabic names
- Purchase price, selling price, unit, brand, supplier, shelf location
- SKU, barcode, weight, dimensions, warranty and tags
- Product image upload served from the API `uploads/` folder

### Search and filtering
- Debounced full-text search on name, SKU and barcode
- Direct lookup by numeric ID using the `@` prefix (for example `@42`)
- Category filter, sortable columns and server-side pagination (max 100 rows per page)
- Virtualised table for large catalogues

### Stock
- `remaining_stock` with `min_stock_level` / `max_stock_level` thresholds
- Low-stock and out-of-stock views
- Stock decremented automatically when the sales app records a sale

### Prices
- Every price change is written to the `price_history` table
- Per-product price history dialog with previous values and change dates

### Reporting and tools
- Dashboard statistics: total products, categories, inventory value, alerts
- Excel export (`xlsx`) of the current filtered view
- QR code generation per product for shelf labels
- Light / dark theme, toast notifications, skeleton loaders

### Internationalisation
- French (default) and Arabic with full RTL layout
- Language detection and persistence via `i18next-browser-languagedetector`
- Prices formatted in MAD

---

## Tech stack

| Layer | Technology |
| --- | --- |
| UI | React 18.3, React Router 7, Tailwind CSS 3.4, shadcn/ui + Radix UI, Lucide icons |
| Data | TanStack Query, TanStack Virtual, React Hook Form + Zod |
| i18n | i18next, react-i18next |
| Build | Vite 6, TypeScript 5.6, Biome 1.9 |
| API | Express 4, mysql2, Multer, dotenv |
| Mobile | Capacitor 7 (Android, app id `com.drogueriejamal.inventory`) |

---

## Getting started

```bash
# from this directory
bun install
cd backend && bun install && cd ..

cp .env.example backend/.env      # then edit the MySQL credentials

bun run dev                       # frontend + API
```

| URL | Description |
| --- | --- |
| http://localhost:5173 | Frontend |
| http://localhost:5000/api/health | API health check |

The Vite dev server proxies every `/api` request to `http://localhost:5000`, so the
frontend can use relative URLs in development.

### Database

```bash
mysql -u root -p -e "CREATE DATABASE products_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p products_manager < ../databases/products_manager.sql
```

A minimal schema (`categories` + `products` only) is also available in
[`backend/database.sql`](./backend/database.sql), and a seeded variant in
`backend/setup-mysql-droguerie.sql`.

---

## Scripts

| Script | Description |
| --- | --- |
| `bun run dev` | Backend + frontend via `concurrently` |
| `bun run dev:frontend` | Vite only, bound to `0.0.0.0` |
| `bun run dev:backend` | Express API only (nodemon) |
| `bun run build` | Production build into `dist/` |
| `bun run preview` | Serve the production build |
| `bun run lint` | `biome lint --write` |
| `bun run format` | `biome format --write` |

---

## Project structure

```
products_manager/
├── src/
│   ├── components/
│   │   ├── ui/                    shadcn/ui primitives + LazyImage, Pagination,
│   │   │                          Spinner, VirtualizedTable
│   │   ├── Navbar.tsx             Top bar, search, language and theme switchers
│   │   ├── ProductTable.tsx       Main listing with sorting and bulk selection
│   │   ├── ProductForm.tsx        Create / edit form (React Hook Form + Zod)
│   │   ├── ProductHoverModal.tsx  Quick preview on hover
│   │   ├── ViewProduct.tsx        Full product page
│   │   ├── PriceHistory.tsx       Price change timeline
│   │   ├── QRCodeComponent.tsx    Shelf-label QR codes
│   │   ├── CategoryFilter.tsx     Category dropdown
│   │   └── theme-provider.tsx     next-themes wrapper
│   ├── hooks/                     useProducts, useDebounce
│   ├── i18n/locales/              fr.json, ar.json
│   ├── services/api.ts            Typed API client
│   ├── types/index.ts             Product, Category, API response types
│   └── App.tsx                    Routes and dashboard state
├── backend/                       Express API (see backend/README.md)
├── vite.config.ts                 Alias `@` -> ./src, /api proxy to :5000
├── tailwind.config.js
├── capacitor.config.ts
└── netlify.toml
```

### Routes

| Path | View |
| --- | --- |
| `/` | Dashboard with statistics and the product table |
| `/view/product/:id` | Read-only product detail |
| `/edit/product/:id` | Edit form for a single product |

---

## Android build (Capacitor)

```bash
bun run build
bunx cap add android      # first time only
bunx cap sync
bunx cap open android     # build the APK from Android Studio
```

The web assets are taken from `dist/` (`webDir` in `capacitor.config.ts`).
Point the app to a reachable API host before building a release, since
`localhost` on a device refers to the device itself.

---

## Deployment

`netlify.toml` builds with `bun run build`, publishes `dist/`, and rewrites
all unknown paths to `index.html` for client-side routing. The `/api/*` redirect
targets a Netlify function; if you keep the Express backend, host it separately
and point the frontend at its public URL instead.

```bash
bun run build
netlify deploy --prod --dir=dist
```

---

## Notes

- The API exposes `PUT /api/products` and `DELETE /api/products` without an `:id`
  segment: the id travels in the JSON body and the query string respectively.
- Uploaded images are stored on the API filesystem under `uploads/`. Use a volume
  or object storage in production so images survive redeploys.
