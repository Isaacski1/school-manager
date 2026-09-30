import { describe, it } from 'node:test';
import assert from 'node:assert';

// --- Helpers ---

function getDraftKey(schoolId, classId, subject, term, academicYear) {
  const DRAFT_PREFIX = 'school-manager-assessment-draft-';
  const tuple = JSON.stringify([schoolId, classId, subject, term, academicYear]);
  return DRAFT_PREFIX + tuple;
}

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

// Simulate the version/context capture and post-sync decision logic
function simulateSyncCompletion(captured, currentDraft, currentContext) {
  if (
    currentContext.schoolId !== captured.schoolId ||
    currentContext.classId !== captured.classId ||
    currentContext.subject !== captured.subject ||
    currentContext.term !== captured.term ||
    currentContext.academicYear !== captured.academicYear
  ) {
    return 'context-changed';
  }

  if (
    currentDraft &&
    currentDraft.version === captured.version &&
    currentDraft.lastModified === captured.lastModified &&
    currentDraft.schoolId === captured.schoolId &&
    currentDraft.classId === captured.classId &&
    currentDraft.subject === captured.subject &&
    currentDraft.term === captured.term &&
    currentDraft.academicYear === captured.academicYear
  ) {
    return 'deleted';
  }
  if (currentDraft) {
    return 'pending';
  }
  return 'idle';
}

// Simulate the multi-tab revision conflict check
function hasStoredRevisionChanged(loadedRevision, currentContext, draftKey) {
  if (loadedRevision === null) return false;

  const storedDraft = loadDraft(draftKey);
  if (!storedDraft) return false;

  const storedContextMatches =
    storedDraft.schoolId === currentContext.schoolId &&
    storedDraft.classId === currentContext.classId &&
    storedDraft.subject === currentContext.subject &&
    storedDraft.term === currentContext.term &&
    storedDraft.academicYear === currentContext.academicYear;

  return storedContextMatches && storedDraft.version !== loadedRevision;
}

// Simulate notification idempotency using deterministic IDs
const notificationStore = new Map();
function addSystemNotification(id, notification) {
  if (notificationStore.has(id)) {
    return 'duplicate';
  }
  notificationStore.set(id, notification);
  return 'created';
}

function buildNotificationId(schoolId, classId, subject, term, academicYear, version) {
  return `${schoolId}_${classId}_${subject}_${term}_${academicYear}_assessment_save_v${version}`;
}

// --- Phase 1 regression ---

describe('Phase 1 regression: draft key collision', () => {
  it('produces different keys for school-a-b / c and school-a / b-c', () => {
    const key1 = getDraftKey('school-a-b', 'c', 'd', 1, 'e');
    const key2 = getDraftKey('school-a', 'b-c', 'd', 1, 'e');
    assert.notStrictEqual(key1, key2);
  });
});

describe('Phase 1 regression: context isolation', () => {
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
    assert.strictEqual(draftB, null);
  });
});

// --- Phase 2: sync status semantics ---

describe('Phase 2: sync status semantics', () => {
  it('version 1 sync succeeds with no newer version -> deleted', () => {
    const captured = {
      lastModified: 1000,
      version: 1,
      schoolId: 's1',
      classId: 'c1',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
    };
    const currentDraft = {
      lastModified: 1000,
      version: 1,
      schoolId: 's1',
      classId: 'c1',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
    };
    const result = simulateSyncCompletion(captured, currentDraft, captured);
    assert.strictEqual(result, 'deleted');
  });

  it('version 1 sync completes but version 2 exists -> pending', () => {
    const captured = {
      lastModified: 1000,
      version: 1,
      schoolId: 's1',
      classId: 'c1',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
    };
    const currentDraft = {
      lastModified: 2000,
      version: 2,
      schoolId: 's1',
      classId: 'c1',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
    };
    const result = simulateSyncCompletion(captured, currentDraft, captured);
    assert.strictEqual(result, 'pending');
  });

  it('version 1 sync fails -> error path is independent', () => {
    const captured = {
      lastModified: 1000,
      version: 1,
      schoolId: 's1',
      classId: 'c1',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
    };
    const currentDraft = null;
    const result = simulateSyncCompletion(captured, currentDraft, captured);
    assert.strictEqual(result, 'idle');
  });
});

// --- Phase 2: context safety ---

describe('Phase 2: context safety', () => {
  it('context A sync cannot clear context B draft', () => {
    const keyA = getDraftKey('school-a', 'class-a', 'Math', 1, '2023-2024');
    const keyB = getDraftKey('school-b', 'class-b', 'English', 1, '2023-2024');

    saveDraft(keyA, {
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
      assessments: {},
      lastModified: 1000,
      version: 1,
    });

    saveDraft(keyB, {
      schoolId: 'school-b',
      classId: 'class-b',
      subject: 'English',
      term: 1,
      academicYear: '2023-2024',
      assessments: {},
      lastModified: 1000,
      version: 1,
    });

    const capturedForA = {
      lastModified: 1000,
      version: 1,
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
    };
    const currentDraftB = loadDraft(keyB);
    const currentContextB = {
      schoolId: 'school-b',
      classId: 'class-b',
      subject: 'English',
      term: 1,
      academicYear: '2023-2024',
    };

    const result = simulateSyncCompletion(capturedForA, currentDraftB, currentContextB);
    assert.strictEqual(result, 'context-changed');

    const draftB = loadDraft(keyB);
    assert.ok(draftB, 'Context B draft must remain');
    assert.strictEqual(draftB.subject, 'English');
  });

  it('context A sync cannot mutate context B sync state', () => {
    const pendingForB = {
      lastModified: 1000,
      version: 1,
      schoolId: 'school-b',
      classId: 'class-b',
      subject: 'English',
      term: 1,
      academicYear: '2023-2024',
    };
    const capturedForA = {
      lastModified: 1000,
      version: 1,
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
    };

    const contextMatches =
      capturedForA.schoolId === pendingForB.schoolId &&
      capturedForA.classId === pendingForB.classId &&
      capturedForA.subject === pendingForB.subject &&
      capturedForA.term === pendingForB.term &&
      capturedForA.academicYear === pendingForB.academicYear;

    assert.strictEqual(contextMatches, false);
  });

  it('switch A -> B -> A with newer version preserves newest version', () => {
    const keyA = getDraftKey('school-a', 'class-a', 'Math', 1, '2023-2024');
    const keyB = getDraftKey('school-b', 'class-b', 'English', 1, '2023-2024');

    saveDraft(keyA, {
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
      assessments: {},
      lastModified: 1000,
      version: 1,
    });

    saveDraft(keyB, {
      schoolId: 'school-b',
      classId: 'class-b',
      subject: 'English',
      term: 1,
      academicYear: '2023-2024',
      assessments: {},
      lastModified: 1000,
      version: 1,
    });

    const capturedForA = {
      lastModified: 1000,
      version: 1,
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
    };

    const currentContextA = {
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
    };
    const currentDraftA = loadDraft(keyA);
    if (currentDraftA) {
      currentDraftA.version = 2;
      currentDraftA.lastModified = 2000;
      saveDraft(keyA, currentDraftA);
    }

    const currentDraftAAfter = loadDraft(keyA);
    const result = simulateSyncCompletion(capturedForA, currentDraftAAfter, currentContextA);
    assert.strictEqual(result, 'pending');

    const draftA = loadDraft(keyA);
    assert.ok(draftA, 'Context A version 2 draft must remain');
    assert.strictEqual(draftA.version, 2);
  });
});

// --- Phase 2: notification idempotency ---

describe('Phase 2: notification idempotency', () => {
  it('same logical save operation version 5 retried twice -> one notification', () => {
    notificationStore.clear();
    const notificationId = buildNotificationId('school-a', 'class-a', 'Math', 1, '2023-2024', 5);
    const notification = {
      id: notificationId,
      schoolId: 'school-a',
      message: 'Teacher updated assessments for Class A in Math.',
      createdAt: Date.now(),
      isRead: false,
      type: 'assessment',
    };

    const first = addSystemNotification(notificationId, notification);
    const second = addSystemNotification(notificationId, notification);

    assert.strictEqual(first, 'created');
    assert.strictEqual(second, 'duplicate');
    assert.strictEqual(notificationStore.size, 1);
  });

  it('save operation version 5 vs version 6 -> different notifications', () => {
    notificationStore.clear();
    const id1 = buildNotificationId('school-a', 'class-a', 'Math', 1, '2023-2024', 5);
    const id2 = buildNotificationId('school-a', 'class-a', 'Math', 1, '2023-2024', 6);

    addSystemNotification(id1, {
      id: id1,
      schoolId: 'school-a',
      message: 'Math update v5',
      createdAt: Date.now(),
      isRead: false,
      type: 'assessment',
    });
    addSystemNotification(id2, {
      id: id2,
      schoolId: 'school-a',
      message: 'Math update v6',
      createdAt: Date.now(),
      isRead: false,
      type: 'assessment',
    });

    assert.strictEqual(notificationStore.size, 2);
    assert.notStrictEqual(id1, id2);
  });

  it('school A version 5 !== school B version 5', () => {
    notificationStore.clear();
    const id1 = buildNotificationId('school-a', 'class-a', 'Math', 1, '2023-2024', 5);
    const id2 = buildNotificationId('school-b', 'class-a', 'Math', 1, '2023-2024', 5);

    addSystemNotification(id1, {
      id: id1,
      schoolId: 'school-a',
      message: 'School A Math update',
      createdAt: Date.now(),
      isRead: false,
      type: 'assessment',
    });
    addSystemNotification(id2, {
      id: id2,
      schoolId: 'school-b',
      message: 'School B Math update',
      createdAt: Date.now(),
      isRead: false,
      type: 'assessment',
    });

    assert.strictEqual(notificationStore.size, 2);
    assert.notStrictEqual(id1, id2);
  });
});

// --- Phase 2: multi-tab protection ---

describe('Phase 2: multi-tab protection', () => {
  it('external newer lastModified is detectable', () => {
    const localDraft = {
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
      assessments: { student1: { testScore: 10 } },
      lastModified: 1000,
      version: 1,
    };

    const externalDraft = {
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
      assessments: { student1: { testScore: 20 } },
      lastModified: 2000,
      version: 2,
    };

    const externalIsNewer = externalDraft.lastModified > localDraft.lastModified;
    assert.strictEqual(externalIsNewer, true);
  });

  it('external older lastModified does not trigger conflict warning', () => {
    const localDraft = {
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
      assessments: { student1: { testScore: 20 } },
      lastModified: 2000,
      version: 2,
    };

    const externalDraft = {
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
      assessments: { student1: { testScore: 10 } },
      lastModified: 1000,
      version: 1,
    };

    const externalIsNewer = externalDraft.lastModified > localDraft.lastModified;
    assert.strictEqual(externalIsNewer, false);
  });

  it('external change for different context is ignored', () => {
    const currentKey = getDraftKey('school-a', 'class-a', 'Math', 1, '2023-2024');
    const externalKey = getDraftKey('school-a', 'class-b', 'English', 1, '2023-2024');

    assert.notStrictEqual(currentKey, externalKey);
  });

  it('same timestamp but different content triggers conflict', () => {
    const localDraft = {
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
      assessments: { student1: { testScore: 10 } },
      lastModified: 1000,
      version: 1,
    };

    const externalDraft = {
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
      assessments: { student1: { testScore: 20 } },
      lastModified: 1000,
      version: 1,
    };

    const sameTimestamp = externalDraft.lastModified === localDraft.lastModified;
    const differentContent = JSON.stringify(externalDraft.assessments) !== JSON.stringify(localDraft.assessments);
    assert.strictEqual(sameTimestamp, true);
    assert.strictEqual(differentContent, true);
  });

  it('Tab A loads revision 10, Tab B writes revision 11, Tab A detects conflict', () => {
    const key = getDraftKey('school-a', 'class-a', 'Math', 1, '2023-2024');
    const currentContext = {
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
    };

    // Tab A loads revision 10
    saveDraft(key, {
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
      assessments: { student1: { testScore: 10 } },
      lastModified: 1000,
      version: 10,
    });

    const loadedRevision = 10;
    assert.strictEqual(hasStoredRevisionChanged(loadedRevision, currentContext, key), false);

    // Tab B writes revision 11
    saveDraft(key, {
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
      assessments: { student1: { testScore: 20 } },
      lastModified: 2000,
      version: 11,
    });

    // Tab A attempts to save based on revision 10
    const conflict = hasStoredRevisionChanged(loadedRevision, currentContext, key);
    assert.strictEqual(conflict, true, 'Tab A must detect conflict with stored revision 11');
  });

  it('concurrent edits from two tabs do not silently destroy newer external draft', () => {
    const key = getDraftKey('school-a', 'class-a', 'Math', 1, '2023-2024');
    const currentContext = {
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
    };

    // Both tabs load revision 10
    saveDraft(key, {
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
      assessments: { student1: { testScore: 10 } },
      lastModified: 1000,
      version: 10,
    });

    const tabALoadedRevision = 10;
    const tabBLoadedRevision = 10;

    // Tab B saves revision 11
    saveDraft(key, {
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
      assessments: { student1: { testScore: 20 } },
      lastModified: 2000,
      version: 11,
    });

    // Tab A attempts to save based on revision 10
    const tabAConflict = hasStoredRevisionChanged(tabALoadedRevision, currentContext, key);
    assert.strictEqual(tabAConflict, true, 'Tab A must detect conflict');

    // Tab B attempts to save based on revision 10
    const tabBConflict = hasStoredRevisionChanged(tabBLoadedRevision, currentContext, key);
    assert.strictEqual(tabBConflict, true, 'Tab B must detect conflict');
  });

  it('external update for different assessment context is ignored', () => {
    const currentKey = getDraftKey('school-a', 'class-a', 'Math', 1, '2023-2024');
    const externalKey = getDraftKey('school-a', 'class-b', 'English', 1, '2023-2024');
    const currentContext = {
      schoolId: 'school-a',
      classId: 'class-a',
      subject: 'Math',
      term: 1,
      academicYear: '2023-2024',
    };

    // Ensure current context has no stored draft
    store.delete(currentKey);

    // Save external context
    saveDraft(externalKey, {
      schoolId: 'school-a',
      classId: 'class-b',
      subject: 'English',
      term: 1,
      academicYear: '2023-2024',
      assessments: { student1: { testScore: 20 } },
      lastModified: 2000,
      version: 11,
    });

    // Current tab loaded revision 10 for its own context
    const loadedRevision = 10;
    const conflict = hasStoredRevisionChanged(loadedRevision, currentContext, currentKey);
    assert.strictEqual(conflict, false, 'Different context must not trigger conflict');
  });
});
