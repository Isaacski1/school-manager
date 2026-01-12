const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

exports.deleteAuthUser = functions.firestore
    .document('users/{userId}')
    .onDelete(async (snap, context) => {
        const userId = context.params.userId;
        try {
            await admin.auth().deleteUser(userId);
            console.log(`Successfully deleted auth user: ${userId}`);
        } catch (error) {
            console.error(`Error deleting auth user ${userId}:`, error);
        }
    });

async function deleteCollection(db, collectionPath, batchSize) {
    const collectionRef = db.collection(collectionPath);
    const query = collectionRef.orderBy('__name__').limit(batchSize);

    return new Promise((resolve, reject) => {
        deleteQueryBatch(db, query, resolve, reject);
    });
}

async function deleteQueryBatch(db, query, resolve, reject) {
    const snapshot = await query.get();

    const batchSize = snapshot.size;
    if (batchSize === 0) {
        // When there are no documents left, we are done
        resolve();
        return;
    }

    // Delete documents in a batch
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });
    await batch.commit();

    // Recurse on the next process tick, to avoid
    // exploding the stack.
    process.nextTick(() => {
        deleteQueryBatch(db, query, resolve, reject);
    });
}

exports.resetTermData = functions.https.onCall(async (data, context) => {
    // Check if the user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // Check if the user is an admin
    const userId = context.auth.uid;
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data().role !== 'ADMIN') {
        throw new functions.https.HttpsError('permission-denied', 'Only admins can perform this action.');
    }

    const collectionsToDelete = [
        'attendance',
        'assessments',
        'teacher_attendance',
        'notices',
        'student_remarks',
        'admin_remarks',
        'student_skills',
        'admin_notifications'
    ];

    try {
        // Delete collections
        for (const collectionPath of collectionsToDelete) {
            console.log(`Deleting collection: ${collectionPath}`);
            await deleteCollection(admin.firestore(), collectionPath, 100);
        }

        // Reset school config
        const schoolConfigRef = admin.firestore().collection('settings').doc('schoolConfig');
        await schoolConfigRef.set({
            schoolReopenDate: '',
            vacationDate: '',
            nextTermBegins: ''
        }, { merge: true });
        
        console.log('Term data reset successfully.');
        return { success: true, message: 'Term data has been successfully reset.' };

    } catch (error) {
        console.error('Error resetting term data:', error);
        throw new functions.https.HttpsError('internal', error.message, error.stack);
    }
});