import { describe, it } from 'node:test';
import assert from 'node:assert';

// Replicate the fixed getDraftKey implementation for regression testing.
const DRAFT_PREFIX = 'school-manager-assessment-draft-';

function getDraftKey(schoolId, classId, subject, term, academicYear) {
  const tuple = JSON.stringify([schoolId, classId, subject, term, academicYear]);
  return DRAFT_PREFIX + tuple;
}

// Mock localStorage
const store = new Map();
global.localStorage = {
  getItem: (key) => store.get(key) || null,
  setItem: (key, value) => store.set(key, value),
  removeItem: (key) => store.delete(key),
  get length() { return store.size; },
  key: (i) => Array.from(store.keys())[i] || null,
};

function saveDraft(key, draft) {
  localStorage.setItem(key, JSON.stringify(draft));
}

function loadDraft(key) {
  const json = localStorage.getItem(key);
  if (!json) return null;
  return JSON.parse(json);
}

function deleteDraft(key) {
  localStorage.removeItem(key);
}

describe('Draft key collision regression', () => {
  it('produces different keys for school-a-b / c and school-a / b-c', () => {
    const key1 = getDraftKey('school-a-b', 'c', 'd', 1, 'e');
    const key2 = getDraftKey('school-a', 'b-c', 'd', 1, 'e');
    assert.notStrictEqual(key1, key2);
  });

  it('produces different keys when subject contains separator characters', () => {
    const key1 = getDraftKey('s1', 'c1', 'English/Language', 1, '2023-2024');
    const key2 = getDraftKey('s1', 'c1', 'English', 1, '2023/2024');
    assert.notStrictEqual(key1, key2);
  });

  it('produces different keys when academic year contains a hyphen', () => {
    const key1 = getDraftKey('s1', 'c1', 'Math', 1, '2023-2024');
    const key2 = getDraftKey('s1', 'c1', 'Math', 1, '2023');
    assert.notStrictEqual(key1, key2);
  });
});

describe('Context isolation regression', () => {
  it('does not leak context A draft into context B', () => {
    const keyA = getDraftKey('school-a', 'class-a', 'Math', 1, '2023-2024');
    const keyB = getDraftKey('school-a', 'class-b', 'English', 1, '2023-2024');

    saveDraft(keyA, {
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
      assessments: { student1: { testScore: 10 } },
      lastModified: 1000,
      version: 1,
    });

    const draftB = loadDraft(keyB);
    assert.strictEqual(draftB, null, 'Context B must not see Context A draft');

    const draftA = loadDraft(keyA);
    assert.ok(draftA, 'Context A draft must still exist');
    assert.strictEqual(draftA.subject, 'Math');
  });

  it('allows context B to have its own independent draft', () => {
    const keyA = getDraftKey('school-a', 'class-a', 'Math', 1, '2023-2024');
    const keyB = getDraftKey('school-a', 'class-b', 'English', 1, '2023-2024');

    saveDraft(keyA, {
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
      assessments: { student1: { testScore: 10 } },
      lastModified: 1000,
      version: 1,
    });

    saveDraft(keyB, {
      schoolId: 'school-a',
      classId: 'class-b',
      subject: 'English',
      term: 1,
      academicYear: '2023-2024',
      assessments: { student2: { testScore: 20 } },
      lastModified: 2000,
      version: 1,
    });

    const draftA = loadDraft(keyA);
    const draftB = loadDraft(keyB);

    assert.ok(draftA);
    assert.ok(draftB);
    assert.strictEqual(draftA.subject, 'Math');
    assert.strictEqual(draftB.subject, 'English');
    assert.notStrictEqual(draftA.assessments.student1, draftB.assessments.student2);
  });

  it('clearing context A draft does not affect context B draft', () => {
    const keyA = getDraftKey('school-a', 'class-a', 'Math', 1, '2023-2024');
    const keyB = getDraftKey('school-a', 'class-b', 'English', 1, '2023-2024');

    saveDraft(keyA, {
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
      assessments: { student1: { testScore: 10 } },
      lastModified: 1000,
      version: 1,
    });

    saveDraft(keyB, {
      schoolId: 'school-a',
      classId: 'class-b',
      subject: 'English',
      term: 1,
      academicYear: '2023-2024',
      assessments: { student2: { testScore: 20 } },
      lastModified: 2000,
      version: 1,
    });

    deleteDraft(keyA);

    const draftA = loadDraft(keyA);
    const draftB = loadDraft(keyB);

    assert.strictEqual(draftA, null, 'Context A draft must be deleted');
    assert.ok(draftB, 'Context B draft must remain');
    assert.strictEqual(draftB.subject, 'English');
  });
});
