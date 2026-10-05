import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { snapshot, restore } from "../../scripts/backup.mjs";

function database(filename = ":memory:") {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(path.join("drizzle", file), "utf8"));
  db.prepare("INSERT INTO employees(id,personnel_number,first_name,last_name) VALUES(?,?,?,?)").run("e", "TEST-1", "Test", "User");
  db.exec("INSERT INTO lifecycle_events(id,employee_id,type) VALUES('event','e','onboarding')");
  return db;
}
test("SQLite action claim blocks stale starts, accepts failed retry, transaction reverts competing receipt writes", () => {
  const db = database();
  const claim = db.prepare("INSERT INTO automation_actions(key,employee_id,event_id,action,job_id,status) VALUES('key','e','event','CreateAdUser',?,'queued') ON CONFLICT(key) DO UPDATE SET job_id=excluded.job_id,status=excluded.status WHERE automation_actions.status='failed'");
  claim.run("first");
  assert.throws(() => claim.run("concurrent"), /Action already claimed/);
  db.exec("UPDATE automation_actions SET status='completed'");
  assert.throws(() => claim.run("duplicate"), /Action already claimed/);
  db.exec("UPDATE automation_actions SET status='failed'"); claim.run("retry");
  assert.equal(db.prepare("SELECT job_id FROM automation_actions").get().job_id, "retry");
  db.exec("INSERT INTO automation_runs(id,employee_id,job_id,mode,status,started_at,job_json) VALUES('run','e','run','Execute','queued','today',json_object('lifecycleEventId','event','employeeRevision',(SELECT updated_at FROM employees WHERE id='e')))");
  db.exec("INSERT INTO automation_receipts VALUES('run','digest','today')");
  db.exec("BEGIN");
  try { db.exec("UPDATE employees SET first_name='Corrupted'; INSERT INTO automation_receipts VALUES('run','other','today'); COMMIT"); assert.fail("duplicate receipt accepted"); }
  catch { db.exec("ROLLBACK"); }
  assert.equal(db.prepare("SELECT first_name FROM employees").get().first_name, "Test"); db.close();
});
test("consistent SQLite backup includes committed WAL data and restore rejects overwrite and tampering", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "it-v1-backup-"));
  const source = path.join(root, "source.sqlite"), target = path.join(root, "backup.sqlite"), restored = path.join(root, "restore.sqlite");
  const db = database(source); db.exec("PRAGMA journal_mode=WAL; INSERT INTO audit_entries(employee_id,action) VALUES('e','WAL committed')");
  const digest = await snapshot(source, target); restore(target, restored, digest);
  const read = new DatabaseSync(restored, { readOnly: true });
  assert.equal(read.prepare("SELECT count(*) AS count FROM audit_entries").get().count, 1); read.close();
  assert.throws(() => restore(target, restored, digest), /empty/);
  writeFileSync(target, Buffer.concat([readFileSync(target), Buffer.from("tampered")]));
  assert.throws(() => restore(target, path.join(root, "bad.sqlite"), digest), /checksum/); db.close();
});

test("manual review merges concurrent action evidence without replacing previous resolutions", () => {
  const db = database();
  db.exec("INSERT INTO automation_runs(id,employee_id,job_id,mode,status,started_at,job_json) VALUES('run','e','run','Execute','review_required','today',json_object('lifecycleEventId','event','employeeRevision',(SELECT updated_at FROM employees WHERE id='e')))");
  const update = db.prepare("UPDATE automation_runs SET review_json=json_patch(COALESCE(review_json,'{}'), ?) WHERE id='run'");
  update.run(JSON.stringify({ "Action-A": "verified_no_effect" }));
  update.run(JSON.stringify({ "Action-B": "verified_no_effect" }));
  assert.deepEqual(JSON.parse(db.prepare("SELECT review_json FROM automation_runs").get().review_json), { "Action-A": "verified_no_effect", "Action-B": "verified_no_effect" }); db.close();
});

test("a plan read before a changed employee or lifecycle event cannot claim execution", () => {
  const db = database();
  const originalRevision = db.prepare("SELECT updated_at FROM employees WHERE id='e'").get().updated_at;
  db.exec("UPDATE employees SET updated_at='changed-after-plan'");
  assert.throws(() => db.prepare("INSERT INTO automation_runs(id,employee_id,job_id,mode,status,started_at,job_json) VALUES('stale','e','stale','Execute','queued','today',?)").run(JSON.stringify({ lifecycleEventId: "event", employeeRevision: originalRevision })), /plan changed/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM automation_runs").get().n, 0); db.close();
});

test("legacy completed cases migrate out of open work while preserving employee, events and history", () => {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql") && f < "0008").sort()) db.exec(readFileSync(path.join("drizzle", file), "utf8"));
  db.exec("INSERT INTO employees(id,personnel_number,first_name,last_name,status) VALUES('legacy','LEGACY','Existing','Employee','active'); INSERT INTO lifecycle_events(id,employee_id,type) VALUES('legacy-event','legacy','onboarding'); INSERT INTO workflow_tasks(id,employee_id,event_type,title,status) VALUES('legacy-task','legacy','onboarding','Delivered','done'); INSERT INTO audit_entries(employee_id,action) VALUES('legacy','Preserve history');");
  db.exec(readFileSync("drizzle/0008_icy_joystick.sql", "utf8"));
  assert.equal(db.prepare("SELECT status FROM employees").get().status, "completed");
  assert.equal(db.prepare("SELECT status FROM lifecycle_events").get().status, "completed");
  assert.equal(db.prepare("SELECT lifecycle_event_id FROM workflow_tasks").get().lifecycle_event_id, "legacy-event");
  assert.equal(db.prepare("SELECT count(*) AS n FROM audit_entries").get().n, 1); db.close();
});

test("volume backup finds lifecycle database among real Wrangler cache and D1 metadata SQLite files", () => {
  const root = mkdtempSync(path.join(tmpdir(), "it-v1-volume-"));
  const data = path.join(root, "data"), archive = path.join(root, "backup");
  const directory = path.join(data, "v3", "d1", "miniflare-D1DatabaseObject");
  const cache = path.join(data, "v3", "cache", "miniflare-CacheObject");
  mkdirSync(directory, { recursive: true }); mkdirSync(cache, { recursive: true }); mkdirSync(archive);
  for (const folder of [directory, cache]) { const metadata = new DatabaseSync(path.join(folder, "metadata.sqlite")); metadata.exec("CREATE TABLE _cf_ALARM(id INTEGER)"); metadata.close(); }
  const source = database(path.join(directory, "lifecycle.sqlite")); source.close();
  const execution = spawnSync(process.execPath, ["scripts/backup.mjs", "backup", data, archive], { encoding: "utf8" });
  assert.equal(execution.status, 0, execution.stderr);
  const manifest = JSON.parse(readFileSync(path.join(archive, "manifest.json"), "utf8"));
  assert.equal(manifest.relativePath, path.relative(data, path.join(directory, "lifecycle.sqlite")));
  const read = new DatabaseSync(path.join(archive, "database.sqlite"), { readOnly: true });
  assert.equal(read.prepare("SELECT personnel_number FROM employees").get().personnel_number, "TEST-1"); read.close();
});
