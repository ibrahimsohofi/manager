import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// finance_manager UI (FINANCE_PLAN.md §1): fixed port 5175 next to products (5173) and sales (5174).
// The API stays on loopback (server/.env HOST=127.0.0.1): the browser only talks to Vite, which proxies /api.
const apiTarget = process.env.FINANCE_API_URL || "http://127.0.0.1:3002";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: false },
    },
  },
  preview: {
    port: 5175,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: false },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
