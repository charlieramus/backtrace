import { defineConfig } from "vitest/config";

// Backtrace is offline-first: assets (incl. self-hosted fonts) are bundled, never
// fetched from a CDN at runtime. See src/ui/fonts/fonts.css.
export default defineConfig({
  build: {
    target: "es2022",
  },
  test: {
    globals: true,
    environment: "node",
  },
});
