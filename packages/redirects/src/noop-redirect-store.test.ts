import { test } from "node:test";
import assert from "node:assert/strict";
import { NoopRedirectStore } from "./noop-redirect-store.js";

test("getRedirect returns null before anything has been set", async () => {
  const store = new NoopRedirectStore();
  assert.equal(await store.getRedirect("golisimo"), null);
});

test("setRedirect then getRedirect round-trips without a real network call", async () => {
  const store = new NoopRedirectStore();
  await store.setRedirect("golisimo", "https://affiliate.example/track?id=golisimo");
  assert.equal(await store.getRedirect("golisimo"), "https://affiliate.example/track?id=golisimo");
});

test("tracks multiple slugs independently", async () => {
  const store = new NoopRedirectStore();
  await store.setRedirect("golisimo", "https://a.example");
  await store.setRedirect("safe", "https://b.example");
  assert.equal(await store.getRedirect("golisimo"), "https://a.example");
  assert.equal(await store.getRedirect("safe"), "https://b.example");
});
