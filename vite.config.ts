import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite config for the GPSFMS Advanced Report Builder MyGeotab add-in.
 *
 * The add-in is hosted at:
 *   https://austin-gpsfms.github.io/advanced_report_builder/dist/index.html
 *
 * GitHub Pages serves from the repo root, so `base` points at /repo/dist/.
 * All asset URLs in the built HTML are rewritten relative to that base.
 */
export default defineConfig({
  base: "/advanced_report_builder/dist/",
  plugins: [react()],
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: true,
    // Inline assets up to ~20KB so we ship fewer files.
    assetsInlineLimit: 20480,
    rollupOptions: {
      output: {
        // Pin filenames so MyGeotab's iframe cache doesn't go stale silently.
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
