import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeName,
  normalizeSchoolName,
  scoreProfessorName,
  selectProfessorResult,
  selectSchoolResult,
} from "../src/matching.js";

test("normalizes punctuation, accents, titles, and last-name-first names", () => {
  assert.equal(normalizeName("Dr. José L. García"), "jose l garcia");
  assert.equal(normalizeName("García, José"), "jose garcia");
});

test("matches an initial to a full first name", () => {
  assert.ok(scoreProfessorName("J Smith", "John Smith") >= 60);
});

test("rejects a different last name", () => {
  assert.ok(scoreProfessorName("Jane Smith", "Jane Jones") < 60);
});

test("selects the closest professor", () => {
  const results = [
    { node: { firstName: "John", lastName: "Smith", numRatings: 3 } },
    { node: { firstName: "Jane", lastName: "Doe", numRatings: 20 } },
  ];
  assert.equal(selectProfessorResult("J. Smith", results), results[0]);
});

test("normalizes CUNY school names and selects the best school", () => {
  assert.equal(normalizeSchoolName("CUNY, Baruch College"), "baruch");
  const results = [
    { node: { name: "Baruch College", numRatings: 10 } },
    { node: { name: "Brooklyn College", numRatings: 100 } },
  ];
  assert.equal(selectSchoolResult("CUNY Baruch College", results), results[0]);
});

test("returns null when no professor or school is a credible match", () => {
  assert.equal(
    selectProfessorResult("Jane Smith", [
      { node: { firstName: "Robert", lastName: "Jones", numRatings: 10 } },
    ]),
    null,
  );
  assert.equal(
    selectSchoolResult("Baruch College", [
      { node: { name: "Brooklyn College", numRatings: 100 } },
    ]),
    null,
  );
});
