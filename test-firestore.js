import test from "node:test";
import assert from "node:assert/strict";

// Simple test to verify Firestore merge behavior
test("Firestore merge test", async () => {
  // Create a mock firestore
  const records = new Map();
  const firestore = {
    collection: (name) => {
      return {
        doc: (id) => {
          return {
            get: async () => {
              return new FakeSnapshot(records.get(id));
            },
            set: async (data, options = {}) => {
              const merge = options?.merge ?? false;
              if (merge && records.get(id)) {
                const clone = structuredClone({ ...records.get(id), ...data });
                records.set(id, clone);
              } else {
                const clone = structuredClone(data);
                records.set(id, clone);
              }
            }
          };
        }
      };
    }
  };
  
  // Test 1: Basic merge preserves existing fields
  await firestore.collection("test").doc("test1").set({
    a: 1,
    b: 2,
    c: 3
  }, { merge: true });
  
  let doc = await firestore.collection("test").doc("test1").get();
  assert.ok(doc.exists);
  let data = doc.data();
  assert.equal(data.a, 1);
  assert.equal(data.b, 2);
  assert.equal(data.c, 3);
  
  // Update with new data
  await firestore.collection("test").doc("test1").set({
    b: 20,
    d: 4
  }, { merge: true });
  
  doc = await firestore.collection("test").doc("test1").get();
  assert.ok(doc.exists);
  data = doc.data();
  assert.equal(data.a, 1); // preserved
  assert.equal(data.b, 20); // updated
  assert.equal(data.c, 3); // preserved
  assert.equal(data.d, 4); // added
  
  console.log("Firestore merge test passed");
});

// Helper class for test
class FakeSnapshot {
  constructor(data) {
    this.exists = data !== undefined && data !== null;
    this._data = data || null;
  }
  data() {
    return this._data;
  }
};
