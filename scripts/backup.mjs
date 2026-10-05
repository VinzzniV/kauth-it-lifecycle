import { DatabaseSync, backup } from "node:sqlite";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";

function files(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(path.join(root, e.name)) : [path.join(root, e.name)]);
}
export async function snapshot(source, destination) {
  if (existsSync(destination)) throw new Error("Backup destination already exists.");
  mkdirSync(path.dirname(destination), { recursive: true });
  const db = new DatabaseSync(source, { readOnly: true });
  try { await backup(db, destination); } finally { db.close(); }
  const check = new DatabaseSync(destination);
  try {
    // The archive must remain readable without transient WAL/SHM sidecars.
    check.exec("PRAGMA journal_mode = DELETE");
    if (check.prepare("PRAGMA quick_check").get().quick_check !== "ok" || check.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Backup integrity check failed.");
  } finally { check.close(); }
  return createHash("sha256").update(readFileSync(destination)).digest("hex");
}
export function restore(source, destination, expectedHash) {
  if (existsSync(destination)) throw new Error("Restore requires a new, empty destination database.");
  const actual = createHash("sha256").update(readFileSync(source)).digest("hex");
  if (!expectedHash || actual !== expectedHash) throw new Error("Backup checksum mismatch.");
  const db = new DatabaseSync(source, { readOnly: true });
  try { if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok") throw new Error("Invalid backup."); } finally { db.close(); }
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"))) {
  const [operation, dataRoot, backupRoot] = process.argv.slice(2);
  if (!["backup", "restore"].includes(operation) || !dataRoot || !backupRoot) throw new Error("Usage: node scripts/backup.mjs backup|restore DATA_ROOT BACKUP_DIRECTORY");
  if (operation === "backup") {
    if (existsSync(path.join(backupRoot, "manifest.json"))) throw new Error("Backup directory already contains a manifest.");
    const databases = files(dataRoot).filter((p) => p.endsWith(".sqlite")).filter((filename) => {
      const candidate = new DatabaseSync(filename, { readOnly: true });
      try { return candidate.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'employees'").get() !== undefined; }
      finally { candidate.close(); }
    });
    if (databases.length !== 1) throw new Error("Expected exactly one lifecycle SQLite database.");
    const relativePath = path.relative(dataRoot, databases[0]);
    const digest = await snapshot(databases[0], path.join(backupRoot, "database.sqlite"));
    writeFileSync(path.join(backupRoot, "manifest.json"), JSON.stringify({ schemaVersion: 1, revision: process.env.GIT_REVISION ?? "unknown", createdAt: new Date().toISOString(), relativePath, sha256: digest }, null, 2));
    console.log("Consistent database snapshot verified.");
  } else {
    if (existsSync(dataRoot) && readdirSync(dataRoot).length) throw new Error("Restore requires an empty isolated data volume.");
    const manifest = JSON.parse(readFileSync(path.join(backupRoot, "manifest.json"), "utf8"));
    const destination = path.resolve(dataRoot, manifest.relativePath);
    if (!destination.startsWith(path.resolve(dataRoot) + path.sep)) throw new Error("Invalid manifest path.");
    restore(path.join(backupRoot, "database.sqlite"), destination, manifest.sha256);
    console.log("Backup restored to empty isolated volume.");
  }
}
