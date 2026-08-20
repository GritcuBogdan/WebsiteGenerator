import { test } from "node:test";
import assert from "node:assert/strict";
import { createSeed, createSeededRng, pickMany, pickOne } from "./seeded-rng.js";

test("createSeed is deterministic for the same parts", () => {
  assert.equal(createSeed(["luckyspin", "en-US", "v1"]), createSeed(["luckyspin", "en-US", "v1"]));
});

test("createSeed differs when any part differs", () => {
  const base = createSeed(["luckyspin", "en-US", "v1"]);
  assert.notEqual(createSeed(["goldrush", "en-US", "v1"]), base);
  assert.notEqual(createSeed(["luckyspin", "de-DE", "v1"]), base);
  assert.notEqual(createSeed(["luckyspin", "en-US", "v2"]), base);
});

test("createSeededRng produces the same sequence for the same seed", () => {
  const rngA = createSeededRng(createSeed(["luckyspin", "en-US", "v1"]));
  const rngB = createSeededRng(createSeed(["luckyspin", "en-US", "v1"]));
  const sequenceA = Array.from({ length: 10 }, () => rngA());
  const sequenceB = Array.from({ length: 10 }, () => rngB());
  assert.deepEqual(sequenceA, sequenceB);
});

test("createSeededRng produces different sequences for different seeds", () => {
  const rngA = createSeededRng(createSeed(["luckyspin", "en-US", "v1"]));
  const rngB = createSeededRng(createSeed(["luckyspin", "en-US", "v2"]));
  const sequenceA = Array.from({ length: 10 }, () => rngA());
  const sequenceB = Array.from({ length: 10 }, () => rngB());
  assert.notDeepEqual(sequenceA, sequenceB);
});

test("createSeededRng always returns values in [0, 1)", () => {
  const rng = createSeededRng(createSeed(["x", "y", "z"]));
  for (let i = 0; i < 200; i++) {
    const value = rng();
    assert.ok(value >= 0 && value < 1, `value ${value} out of range`);
  }
});

test("pickOne always returns an element that was in the input array", () => {
  const rng = createSeededRng(createSeed(["a", "b", "c"]));
  const items = ["intro-001", "intro-002", "intro-003"];
  for (let i = 0; i < 50; i++) {
    assert.ok(items.includes(pickOne(rng, items)));
  }
});

test("pickOne throws on an empty array", () => {
  const rng = createSeededRng(1);
  assert.throws(() => pickOne(rng, []), RangeError);
});

test("pickOne is deterministic for a given seed", () => {
  const items = ["a", "b", "c", "d", "e"];
  const pickA = pickOne(createSeededRng(createSeed(["seed"])), items);
  const pickB = pickOne(createSeededRng(createSeed(["seed"])), items);
  assert.equal(pickA, pickB);
});

test("pickMany returns items without repeats", () => {
  const rng = createSeededRng(createSeed(["faq-seed"]));
  const items = ["faq-001", "faq-002", "faq-003", "faq-004", "faq-005"];
  const picked = pickMany(rng, items, 3);
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked).size, 3);
  for (const item of picked) assert.ok(items.includes(item));
});

test("pickMany caps at the pool size when count exceeds it", () => {
  const rng = createSeededRng(1);
  const items = ["a", "b"];
  assert.equal(pickMany(rng, items, 5).length, 2);
});

test("pickMany with count 0 returns an empty array", () => {
  const rng = createSeededRng(1);
  assert.deepEqual(pickMany(rng, ["a", "b"], 0), []);
});

test("pickMany preserves the original relative order of picked items", () => {
  const rng = createSeededRng(createSeed(["order-seed"]));
  const items = ["a", "b", "c", "d", "e", "f", "g"];
  const picked = pickMany(rng, items, 4);
  const indices = picked.map((item) => items.indexOf(item));
  const sortedIndices = [...indices].sort((a, b) => a - b);
  assert.deepEqual(indices, sortedIndices);
});

test("pickMany is deterministic for a given seed", () => {
  const items = ["a", "b", "c", "d", "e"];
  const pickA = pickMany(createSeededRng(createSeed(["seed"])), items, 3);
  const pickB = pickMany(createSeededRng(createSeed(["seed"])), items, 3);
  assert.deepEqual(pickA, pickB);
});
