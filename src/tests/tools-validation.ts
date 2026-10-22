import test from "node:test";
import { validateToolArguments } from "../tools/validation.js";
import { filesystemTools } from "../tools/definitions.js";
import assert from "node:assert/strict";


test("accepts valid list_files arguments", () => {
  const result = validateToolArguments(filesystemTools[0], {
    path: ".",
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});



test("rejects missing required arguments", () => {
  const result = validateToolArguments(filesystemTools[0], {});

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("Missing required")));
});


test("rejects unexpected arguments", () => {
  const result = validateToolArguments(filesystemTools[0], {
    path: ".",
    command: "del *",
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("Unexpected argument")));
});


test("rejects a non-object argument payload", () => {
  const result = validateToolArguments(filesystemTools[0], []);

  assert.equal(result.valid, false);
});

test("rejects an empty search query", () => {
  const result = validateToolArguments(filesystemTools[2], {
    query: "   ",
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("must not be empty")));
});
