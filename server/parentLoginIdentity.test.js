const createMockAdmin = (options = {}) => {
  const records = new Map();
  const callLog = { verifyIdTokenCalls: [] };

  if (options.userRecord) {
    records.set(`users/${options.userRecord.uid}`, options.userRecord);
  }
  if (options.schoolRecord) {
    records.set(`schools/${options.schoolRecord.id}`, options.schoolRecord);
  }

  const validToken = options.validToken || "valid-token-for-user-A";
  const userUid = options.userUid || "user-A-uid";

  const authInstance = {
    verifyIdToken: async (token) => {
      callLog.verifyIdTokenCalls.push(token);
      if (options.verifyIdTokenImpl) {
        return options.verifyIdTokenImpl(token);
      }
      if (token === validToken) {
        return { uid: userUid };
      }
      throw new Error("auth/id-token-expired");
    },
  };

  const firestoreInstance = new FakeFirestore(records);

  const handler = createSecurityLoginLogHandler({
    auth: () => authInstance,
    firestore: () => firestoreInstance
  });

  return { 
    auth: authInstance, 
    firestore: firestoreInstance, 
    handler: handler, 
    callLog: callLog,
    records: records
  };