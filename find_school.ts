
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { firestore } from "./services/firebase";

async function findSchool() {
  const schoolsRef = collection(firestore, "schools");
  const snap = await getDocs(schoolsRef);
  
  snap.forEach(doc => {
    const data = doc.data();
    if (data.name && data.name.includes("JoeCaro")) {
      console.log("Found JoeCaro School:", doc.id);
      console.log("Config:", JSON.stringify(data, null, 2));
    }
  });
}
findSchool();
