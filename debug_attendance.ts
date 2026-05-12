
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { firestore } from "./services/firebase";

async function debugAttendance() {
  console.log("Debugging Attendance...");
  const attendanceRef = collection(firestore, "attendance");
  
  // Just get some records to see the structure
  const q = query(attendanceRef, limit(10));
  const snap = await getDocs(q);
  
  console.log(`Total records found (limit 10): ${snap.size}`);
  snap.forEach(doc => {
    console.log("Record ID:", doc.id);
    console.log("Data:", JSON.stringify(doc.data(), null, 2));
  });
}

// Since I can't run this directly, I'll try to find a way to see the data.
