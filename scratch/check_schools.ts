import { db } from "../services/mockDb";

async function checkSchools() {
  const schools = await db.getPublicSchools();
  console.log("Active schools with logos:", schools);
}

checkSchools();
