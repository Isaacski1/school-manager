
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { firestore } from "./services/firebase";

async function checkAttendance() {
  const schoolId = "jUoVfI6gY5XQn8N8f9Y6"; // I'll try to find the school ID from logs or guess
  // Actually, I don't know the school ID.
  
  const attendanceRef = collection(firestore, "attendance");
  const snap = await getDocs(query(attendanceRef, limit(20)));
  
  snap.forEach(doc =\u003e {
    console.log("Record:", JSON.stringify(doc.data(), null, 2));
  });
}
