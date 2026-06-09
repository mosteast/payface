import { defineConfig } from "vitest/config";

const should_run_integration = process.env.PAYFACE_RUN_INTEGRATION === "1";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["./test/setup.ts"],
    testTimeout: 180000,
    hookTimeout: 180000,
    exclude: [
      "build",
      "node_modules",
      "tmp",
      "_dep",
      "storage",
      ...(should_run_integration ? [] : ["**/*.integration.test.ts"]),
    ],
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
        "src/payface.ts",
        "test/**",
        "**/*.test.ts",
        "**/*.unit.test.ts",
      ],
    },
  },
});
