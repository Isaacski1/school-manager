import { db } from '../services/mockDb';
import { CLASSES_LIST } from '../constants';

(async () => {
  try {
    const schoolId = process.env.SCHOOL_ID;
    if (!schoolId) {
      throw new Error('SCHOOL_ID environment variable is required');
    }
    console.log('Starting reset of assessments for all classes...');
    for (const cls of CLASSES_LIST) {
      console.log(`Resetting assessments for ${cls.id} (${cls.name})...`);
      await db.resetAssessmentsForClass(schoolId, cls.id, true);
      console.log(`Done: ${cls.id}`);
    }
    console.log('All classes processed.');
    process.exit(0);
  } catch (err) {
    console.error('Error resetting assessments:', err);
    process.exit(1);
  }
})();
