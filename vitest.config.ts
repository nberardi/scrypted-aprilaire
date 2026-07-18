import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts"],
        environment: "node",
        // Protocol unit tests must be deterministic and isolated from hardware.
        clearMocks: true,
    },
});
