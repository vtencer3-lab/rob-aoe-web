import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.db.test.ts"],
    environment: "node",
    fileParallelism: false,
    setupFiles: ["./vitest.db.setup.ts"],
  },
});
