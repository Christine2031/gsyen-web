import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = resolve(scriptDirectory, "..");

export function validateContract(contract) {
  if (
    contract?.contractVersion !== 2
    || contract.bundleMarker !== "gsyen-inbound-receipt-v2-compatible"
    || contract.expandMigration !== 21
    || contract.contractMigration !== 22
    || contract.expandSchemaMarker !== "gsyen-inbound-receipt-v2-expand-0021"
    || contract.contractSchemaMarker !== "gsyen-inbound-receipt-v2-contract-0022"
    || contract.rollbackFloor !== "receipt-v2-compatible-mirror-disabled"
    || contract.mirrorEnabledByDefault !== false
  ) {
    throw new Error("inbound_release_contract_manifest_invalid");
  }
  return contract;
}

export function validateCandidateBundle(source, contract) {
  if (!source.includes(contract.bundleMarker)) {
    throw new Error("candidate_bundle_is_below_receipt_v2_rollback_floor");
  }
  return true;
}

async function javascriptFiles(path) {
  const metadata = await stat(path);
  if (metadata.isFile()) return /\.(?:c|m)?js$/.test(path) ? [path] : [];
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? javascriptFiles(child) : Promise.resolve(
      /\.(?:c|m)?js$/.test(entry.name) ? [child] : [],
    );
  }));
  return nested.flat();
}

export async function checkRelease(candidatePath) {
  const contract = validateContract(JSON.parse(await readFile(
    join(packageDirectory, "release-contract.json"),
    "utf8",
  )));
  const expandMigration = await readFile(
    join(packageDirectory, "migrations/0019_inbound_ingest_receipts.sql"),
    "utf8",
  );
  const contractMigration = await readFile(
    join(packageDirectory, "contract-migrations/0022_inbound_identity_contract.sql"),
    "utf8",
  );
  if (/DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?messages_inbound_dedupe/i.test(
    expandMigration,
  )) {
    throw new Error("expand_migration_drops_legacy_index");
  }
  if (!/DROP\s+INDEX\s+IF\s+EXISTS\s+messages_inbound_dedupe/i.test(
    contractMigration,
  )) {
    throw new Error("contract_migration_does_not_drop_legacy_index");
  }
  const regularMigrations = await readdir(join(packageDirectory, "migrations"));
  if (regularMigrations.some((name) => name.startsWith("0022_"))) {
    throw new Error("contract_migration_exposed_to_expand_apply");
  }
  const files = await javascriptFiles(resolve(candidatePath));
  if (files.length === 0) throw new Error("candidate_bundle_not_found");
  const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
  validateCandidateBundle(sources.join("\n"), contract);
  return { files: files.length, marker: contract.bundleMarker };
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const candidate = process.argv[2];
  if (!candidate) {
    console.error("Usage: node scripts/check-inbound-release.mjs <bundle-or-directory>");
    process.exitCode = 2;
  } else {
    try {
      const result = await checkRelease(candidate);
      console.log(JSON.stringify({ event: "inbound_release_gate_passed", ...result }));
    } catch (error) {
      console.error(JSON.stringify({
        event: "inbound_release_gate_failed",
        reason: error instanceof Error ? error.message : String(error),
      }));
      process.exitCode = 1;
    }
  }
}
