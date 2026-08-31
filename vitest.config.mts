import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
    // Live tests hit the real motogp.com API and are opt-in via LIVE=1.
    testTimeout: 30_000
  }
});
