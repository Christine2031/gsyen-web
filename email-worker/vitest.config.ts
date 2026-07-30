import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations("./migrations");

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          MAIL_WORKER_INTERNAL_TOKEN: "dev-internal-token",
        },
      },
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
});
