import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**"],
      reporter: ["text", "html", "json-summary"],
      thresholds: {
        // P0-2: money.ts stays fully covered. Other files get thresholds when a task asks for them.
        "src/core/money.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // P0-3: the extraction schema is core, so it is held to the same bar.
        "src/core/extraction-schema.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
