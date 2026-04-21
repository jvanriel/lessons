import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    environment: "node",
    exclude: ["**/node_modules/**", "**/reference/**", "**/e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
