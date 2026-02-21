import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("@trpc") || id.includes("superjson")) return "data";
          if (
            id.includes("@heroui") ||
            id.includes("motion") ||
            id.includes("react")
          ) {
            return "framework";
          }

          return "vendor";
        },
      },
    },
  },
});
