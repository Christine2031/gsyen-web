import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { configDefaults, defineConfig } from "vitest/config";

const migrations = [
  ...await readD1Migrations("./migrations"),
  ...await readD1Migrations("./contract-migrations"),
];

export default defineConfig({
  test: {
    // This release-gate suite intentionally uses Node's built-in test runner
    // and is executed separately by `npm run test:release-contract`.
    exclude: [...configDefaults.exclude, "test/release-contract.node.test.mjs"],
  },
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
