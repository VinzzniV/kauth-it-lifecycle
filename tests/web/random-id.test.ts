import assert from "node:assert/strict";
import { test } from "node:test";
import { randomId } from "../../lib/random-id";

test("HTTP browser source without randomUUID produces distinct RFC 4122 v4 IDs", () => {
  const source = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) };
  const ids = Array.from({ length: 100 }, () => randomId(source));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("secure context retains its native UUID generator", () => {
  const expected = globalThis.crypto.randomUUID();
  const source = { randomUUID: () => expected, getRandomValues: () => { throw new Error("Fallback must not run"); } };
  assert.equal(randomId(source), expected);
});
