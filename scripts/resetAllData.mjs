import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCHlCLhumJn50nw2JBgJTGeIH_6GKzjFbA",
  authDomain: "noble-care-management-system.firebaseapp.com",
  projectId: "noble-care-management-system",
  storageBucket: "noble-care-management-system.firebasestorage.app",
  messagingSenderId: "573085015524",
  appId: "1:573085015524:web:29ae8a509813ec1199fbf1"
};

initializeApp(firebaseConfig);
const firestore = getFirestore();

const collections = [
  'users',
  'students',
  'attendance',
  'assessments',
  'notices',
  'admin_notifications',
  'teacher_attendance',
  'timetables'
];

async function deleteAllFromCollection(collectionName) {
  console.log(`Deleting all documents from ${collectionName}...`);
  const snap = await getDocs(collection(firestore, collectionName));
  if (snap.docs.length === 0) {
    console.log(`  No documents found in ${collectionName}`);
    return;
  }

  const ops = snap.docs.map(d => deleteDoc(doc(firestore, collectionName, d.id)));
  await Promise.all(ops);
  console.log(`  Deleted ${snap.docs.length} documents from ${collectionName}`);
}

async function resetSettings() {
  console.log('Resetting settings...');

  // Reset subjects
  await setDoc(doc(firestore, 'settings', 'subjects'), {
    list: ['Mathematics', 'English', 'Science', 'Social Studies', 'Religious Education', 'Information Technology']
  });

  // Reset school config
  await setDoc(doc(firestore, 'settings', 'schoolConfig'), {
    schoolName: 'Noble Care Academy',
    academicYear: '2024-2025',
    currentTerm: 'Term 1'
  });

  console.log('  Settings reset to defaults');
}

async function createDefaultAdmin() {
  console.log('Creating default admin user...');
  await setDoc(doc(firestore, 'users', 'admin'), {
    id: 'admin',
    name: 'Administrator',
    email: 'admin@noblecare.edu',
    role: 'ADMIN'
  });
  console.log('  Default admin created');
}

(async () => {
  try {
    console.log('Starting complete database reset...\n');

    // Delete all data from all collections
    for (const collectionName of collections) {
      await deleteAllFromCollection(collectionName);
    }

    // Reset settings to defaults
    await resetSettings();

    // Create default admin
    await createDefaultAdmin();

    console.log('\n✅ Database reset complete!');
    console.log('📝 Default admin credentials:');
    console.log('   Email: admin@noblecare.edu');
    console.log('   Password: admin123 (set in auth context)');
    console.log('\n🔄 You can now start fresh with your school management system.');

    process.exit(0);
  } catch (err) {
    console.error('❌ Error during database reset:', err);
    process.exit(1);
  }
})();