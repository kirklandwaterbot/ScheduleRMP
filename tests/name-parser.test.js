import test from "node:test";
import assert from "node:assert/strict";
import { extractProfessorNames } from "../src/name-parser.js";

test("extracts and deduplicates multiple instructors", () => {
  assert.deepEqual(
    extractProfessorNames("Dr. Ada Lovelace; Alan Turing / Grace Hopper and Ada Lovelace"),
    ["Ada Lovelace", "Alan Turing", "Grace Hopper"],
  );
});

test("normalizes last-name-first instructors and ignores placeholders", () => {
  assert.deepEqual(extractProfessorNames("Lovelace, Ada"), ["Ada Lovelace"]);
  assert.deepEqual(extractProfessorNames("Staff / TBA / Arranged"), []);
});
