import test from "node:test";
import assert from "node:assert/strict";

test("simple merge test", async () => {
  // Simple test to verify merge behavior
  let data1 = { a: 1, b: 2, c: 3 };
  let data2 = { b: 20, d: 4 };
  
  // Simulate merge: { ...data1, ...data2 }
  let merged = { ...data1, ...data2 };
  
  assert.equal(merged.a, 1); // from data1
  assert.equal(merged.b, 20); // from data2 (overwrites)
  assert.equal(merged.c, 3); // from data1
  assert.equal(merged.d, 4); // from data2
  
  console.log("Merge test passed");
});