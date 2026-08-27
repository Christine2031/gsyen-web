import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  checkRelease,
  validateCandidateBundle,
  validateContract,
} from "../scripts/check-inbound-release.mjs";

const contract = validateContract({
  contractVersion: 2,
  bundleMarker: "gsyen-inbound-receipt-v2-compatible",
  expandMigration: 21,
  contractMigration: 22,
  expandSchemaMarker: "gsyen-inbound-receipt-v2-expand-0021",
  contractSchemaMarker: "gsyen-inbound-receipt-v2-contract-0022",
  rollbackFloor: "receipt-v2-compatible-mirror-disabled",
  mirrorEnabledByDefault: false,
});

test("rejects an old Message-ID-dedupe Worker bundle", () => {
  assert.throws(
    () => validateCandidateBundle("legacy worker bundle", contract),
    /below_receipt_v2_rollback_floor/,
  );
});

test("accepts only a receipt-v2-compatible rollback candidate", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gsyen-mail-release-"));
  try {
    await writeFile(
      join(directory, "worker.js"),
      `const marker = ${JSON.stringify(contract.bundleMarker)};`,
      "utf8",
    );
    const result = await checkRelease(directory);
    assert.equal(result.marker, contract.bundleMarker);
    assert.equal(result.files, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
