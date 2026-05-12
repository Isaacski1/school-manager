
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { firestore } from "./services/firebase";

async function findStudent() {
  const studentsRef = collection(firestore, "students");
  const q = query(studentsRef, where("name", "==", "Kwesi Krampah"));
  const snap = await getDocs(q);
  
  snap.forEach(doc => {
    console.log("Found Student:", doc.id);
    console.log("Data:", JSON.stringify(doc.data(), null, 2));
  });
}
findStudent();
