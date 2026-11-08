import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Match Pi's host-provided peer mapping even when dependencies are linked
    // from an existing Pi installation rather than installed into this checkout.
    alias: [
      "@earendil-works/pi-coding-agent",
      "@earendil-works/pi-ai",
      "@earendil-works/pi-tui",
      "typebox",
    ].map((name) => ({
      find: new RegExp(`^${name}$`),
      replacement: fileURLToPath(import.meta.resolve(name)),
    })),
  },
  test: {
    include: ["src/**/*.test.ts", "extensions/**/*.test.ts"],
    setupFiles: ["./tests/setup-mocks.ts"],
    mockReset: true,
  },
});
