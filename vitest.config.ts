import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["./test/setup.ts"],
    testTimeout: 180000,
    hookTimeout: 180000,
    exclude: ["build", "node_modules", "tmp", "_dep", "storage"],
    reporters: ["default", "junit", "json"],
    outputFile: {
      junit: "./tmp/test_report/junit.xml",
      json: "./tmp/test_report/json.json",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      exclude: [
        "build/**",
        "examples/**",
        "node_modules/**",
        "root.js",
        "tmp/**",
        "index.ts",
        "test/**",
        "**/*.test.ts",
        "**/*.unit.test.ts",
      ],
    },
  },
});
