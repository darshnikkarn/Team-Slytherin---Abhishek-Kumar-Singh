import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// In dev we proxy /api to the local FastAPI server, so the browser sees a
// same-origin request and CORS never enters the picture. In production
// VITE_API_URL points at the deployed backend and the proxy is unused.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_BACKEND || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
