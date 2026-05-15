import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite config for the GPSFMS Advanced Report Builder MyGeotab add-in.
 *
 * Hosted at:
 *   https://austin-gpsfms.github.io/advanced_report_builder/dist/index.html
 *
 * `base: "./"` produces RELATIVE asset paths in the built index.html
 * (`<script src="./assets/index-XXX.js">`). This is the safe choice for
 * MyGeotab add-ins because MyGeotab loads the add-in HTML inside an iframe
 * with its own URL handling and was duplicating absolute paths like
 * `/advanced_report_builder/dist/...` into the malformed `//advanced_report_builder/dist//advanced_report_builder/dist/...`.
 * Relative paths resolve naturally against whatever the document's URL is.
 */
export default defineConfig({
  base: "./",
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
