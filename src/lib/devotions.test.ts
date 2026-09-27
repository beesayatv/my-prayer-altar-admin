import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner requires the explicit extension.
// @ts-expect-error TypeScript's bundler mode omits extensions in application imports.
import { defaultSectionKey, devotionImageUrl, slugify } from "./devotions.ts";

test("maps independent devotional item types to controlled sections", () => {
  assert.equal(defaultSectionKey("prayer"), "prayers");
  assert.equal(defaultSectionKey("article"), "articles");
  assert.equal(defaultSectionKey("place"), "places");
  assert.equal(defaultSectionKey("video"), "videos");
});

test("normalizes devotional slugs and CDN paths", () => {
  assert.equal(slugify("Señor Santo Niño Prayer"), "senor-santo-nino-prayer");
  assert.equal(devotionImageUrl("devotions/cover.jpg"), "https://myprayeraltar-videos-sg.b-cdn.net/devotions/cover.jpg");
  assert.equal(devotionImageUrl("https://images.example/cover.jpg"), "https://images.example/cover.jpg");
});
