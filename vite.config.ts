import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "node:path";

const BUILD_ID = Date.now().toString(36);

/** Liste des fichiers de l'app pour que le service worker les garde tous hors connexion. */
function precacheManifest(): Plugin {
  return {
    name: "precache-manifest",
    apply: "build",
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith(".map"));
      this.emitFile({ type: "asset", fileName: "precache.json", source: JSON.stringify(files) });
    },
  };
}

// BASE_PATH est fourni par GitHub Actions (ex. "/form-from-pixels/"). En local : "/".
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss(), precacheManifest()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: { target: "es2020", chunkSizeWarningLimit: 2000 },
});
