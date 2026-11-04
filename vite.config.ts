import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "node:path";

// BASE_PATH est fourni par GitHub Actions (ex. "/form-from-pixels/"). En local : "/".
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: { target: "es2020", chunkSizeWarningLimit: 2000 },
});
