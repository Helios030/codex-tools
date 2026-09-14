import assert from "node:assert/strict";
import { test } from "node:test";
import { arcLength, startupArcFrames } from "../src/utils/quotaArc.ts";

test("quota arc clamps to 270 degrees and distinguishes unknown from zero", () => {
  assert.equal(arcLength(100), 75);
  assert.equal(arcLength(89), 66.75);
  assert.equal(arcLength(59), 44.25);
  assert.equal(arcLength(-1), 0);
  assert.equal(arcLength(101), 75);
  for (const unknown of [null, NaN, Infinity]) assert.deepEqual(startupArcFrames(unknown), []);
  const frames = startupArcFrames(59);
  assert.equal(frames[0].strokeDasharray, "0 100");
  assert.equal(frames[1].strokeDasharray, "75 100");
  assert.equal(frames[2].strokeDasharray, "44.25 100");
  assert.equal(frames[1].offset, 1 / 3);
  assert.equal(startupArcFrames(0)[2].opacity, 0);
});
