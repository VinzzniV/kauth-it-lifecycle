import test from "node:test";
import assert from "node:assert/strict";
import { canonicalJson, resultSchema, sanitizedJob, validateResultBinding } from "../../lib/automation-contract";

const job = { jobId: "job-1", operation: "execute", requestedMode: "Execute", person: { employeeId: "emp-1" }, actions: [{ type: "CreateAdUser", target: "user" }], automationTaskIds: ["task-1"] };
const result = () => resultSchema.parse({ schemaVersion: 1, runId: "job-1", jobId: "job-1", employeeId: "emp-1", operation: "execute", mode: "Execute", status: "completed", startedAt: "2026-10-02T13:00:00.1234567+02:00", completedAt: "2026-10-02T13:01:00.1234567+02:00", actionResults: [{ action: "CreateAdUser", status: "completed" }] });

test("gateway receipt binding rejects forged person, mode, action, task and source", () => {
  validateResultBinding(result(), job);
  for (const update of [{ employeeId: "other" }, { mode: "WhatIf" }, { jobId: "other" }, { relatedRunId: "other" }, { automationTaskIds: ["other-task"] }, { actionResults: [{ action: "CreateHelpdeskTicket", status: "completed" }] }]) assert.throws(() => validateResultBinding(resultSchema.parse({ ...result(), ...update }), job));
});
test("WhatIf and action failures cannot claim real completion", () => {
  assert.throws(() => validateResultBinding({ ...result(), mode: "WhatIf" }, { ...job, requestedMode: "WhatIf" }));
  assert.throws(() => validateResultBinding({ ...result(), actionResults: [{ action: "CreateAdUser", status: "failed" }] }, job));
  assert.throws(() => validateResultBinding({ ...result(), actionResults: [] }, job));
});
test("receipt hashing is independent of property order; stored job excludes credentials", () => {
  assert.equal(canonicalJson({ b: { z: 1, a: 2 }, a: [3, 4] }), canonicalJson({ a: [3, 4], b: { a: 2, z: 1 } }));
  const stored = sanitizedJob({ ...job, adCredential: { username: "test", password: "secret" }, helpdeskCredential: {}, initialPassword: "secret", callbackUrl: "https://evil", callbackToken: "secret" });
  assert.equal(JSON.stringify(stored).includes("secret"), false);
  assert.equal("callbackUrl" in stored, false);
});

test("PowerShell null source fields and distinct group rollback changes bind to the planned identities", () => {
  const source = [{ id: "a", action: "AddGroup:A", resourceId: "group-a", rollbackAction: "Remove-ADGroupMember" }, { id: "b", action: "AddGroup:B", resourceId: "group-b", rollbackAction: "Remove-ADGroupMember" }];
  const rollbackJob = { ...job, operation: "rollback", originalRun: { id: "original", changes: source } };
  const rollback = resultSchema.parse({ ...result(), operation: "rollback", relatedRunId: "original", actionResults: source.map(() => ({ action: "Remove-ADGroupMember", status: "completed" })), changes: source.map((c) => ({ action: c.rollbackAction, resourceType: "Rollback", resourceId: c.resourceId, sourceChangeId: c.id, sourceAction: c.action })) });
  validateResultBinding(rollback, rollbackJob);
  assert.throws(() => validateResultBinding({ ...rollback, changes: [{ ...rollback.changes[0], resourceId: "foreign-object" }] }, rollbackJob));
  assert.throws(() => validateResultBinding({ ...rollback, changes: [{ ...rollback.changes[0], sourceChangeId: "foreign-change" }] }, rollbackJob));
  resultSchema.parse({ ...result(), changes: [{ action: "CreateAdUser", resourceType: "AD-Benutzer", resourceId: "user", sourceChangeId: null, sourceAction: null }] });
});
