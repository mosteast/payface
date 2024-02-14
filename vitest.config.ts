import ms from "ms";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["./test/setup.ts"],
    testTimeout: ms("3m"),
    hookTimeout: ms("3m"),
    exclude: ["build", "node_modules", "tmp", "_dep", "storage"],
    reporters: ["default", "junit", "json"],
    outputFile: {
      junit: "./tmp/test_report/junit.xml",
      json: "./tmp/test_report/json.json",
    },
  },
});
