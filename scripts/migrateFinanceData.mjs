import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const run = async () => {
  const schoolsSnap = await db.collection("schools").get();
  for (const schoolDoc of schoolsSnap.docs) {
    const schoolId = schoolDoc.id;
    const financeSettingsRef = db
      .collection("schools")
      .doc(schoolId)
      .collection("financeSettings")
      .doc("main");

    const financeSettings = await financeSettingsRef.get();
    if (
      financeSettings.exists &&
      financeSettings.data()?.financeVersion === "v2"
    ) {
      continue;
    }

    const [feesSnap, ledgersSnap, paymentsSnap] = await Promise.all([
      db.collection("fees").where("schoolId", "==", schoolId).get(),
      db.collection("student_ledgers").where("schoolId", "==", schoolId).get(),
      db.collection("payments").where("schoolId", "==", schoolId).get(),
    ]);

    const batch = db.batch();
    feesSnap.forEach((docSnap) => {
      batch.set(
        db
          .collection("schools")
          .doc(schoolId)
          .collection("fees")
          .doc(docSnap.id),
        docSnap.data(),
        { merge: true },
      );
    });

    ledgersSnap.forEach((docSnap) => {
      batch.set(
        db
          .collection("schools")
          .doc(schoolId)
          .collection("feeLedgers")
          .doc(docSnap.id),
        docSnap.data(),
        { merge: true },
      );
    });

    paymentsSnap.forEach((docSnap) => {
      batch.set(
        db
          .collection("schools")
          .doc(schoolId)
          .collection("payments")
          .doc(docSnap.id),
        docSnap.data(),
        { merge: true },
      );
    });

    batch.set(
      financeSettingsRef,
      {
        schoolId,
        financeVersion: "v2",
        onboardingMode: "fresh_start",
        onboardingDate: new Date().toISOString().slice(0, 10),
      },
      { merge: true },
    );

    await batch.commit();
    console.log(`Migrated finance data for school ${schoolId}`);
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
