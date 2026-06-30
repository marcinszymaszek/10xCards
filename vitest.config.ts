import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const srcPath = fileURLToPath(new URL("./src", import.meta.url));
const envStubPath = fileURLToPath(new URL("./src/test/astro-env-server.stub.ts", import.meta.url));

// Plain Vitest config (not Astro's `getViteConfig`): the Cloudflare adapter's
// Vite plugin sets `resolve.external` on the worker environment, which Vitest
// rejects. Instead we resolve the two seams the API handlers need directly:
//   - `astro:env/server` → a stub that reads `process.env`
//   - `@/…`              → `src/…`
export default defineConfig({
  resolve: {
    alias: [
      { find: "astro:env/server", replacement: envStubPath },
      { find: /^@\//, replacement: `${srcPath}/` },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
});
