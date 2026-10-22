import { loader } from "../tests/helpers.mjs";

const write = process.argv.includes("--write");
const load = loader();
const { classifyIdentityBlob, copyIdentityBlobPrivate } = load("lib/media.ts");
const { getDb, identityDocuments } = load("lib/db/index.ts");
const rows = await getDb().select({ pathname: identityDocuments.pathname }).from(identityDocuments);

let privateCount = 0;
let publicCount = 0;
let missing = 0;
let failed = 0;
for (const row of rows) {
  const kind = await classifyIdentityBlob(row.pathname);
  if (kind === "private") privateCount += 1;
  if (kind === "missing") missing += 1;
  if (kind !== "public") continue;
  publicCount += 1;
  if (!write) continue;
  const copied = await copyIdentityBlobPrivate(row.pathname);
  if (!copied) failed += 1;
}

if (publicCount === 0 && missing === 0 && privateCount === rows.length) {
  console.log("every identity pathname is already private");
  process.exit(0);
}
console.log(`private ${privateCount}`);
console.log(`public ${publicCount}`);
console.log(`missing ${missing}`);
if (write) console.log(`copy failed ${failed}`);
