import { PhoneCleanupReviewService } from '../lib/services/phone-cleanup-review.service';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function testGroupCount() {
  console.log('--- TESTING GROUP COUNTS (ACTIVE VS ALL) ---');
  const activeGroups = await PhoneCleanupReviewService.getDuplicatePhoneGroups(false);
  const allGroups = await PhoneCleanupReviewService.getDuplicatePhoneGroups(true);

  console.log(`Active pending duplicate groups remaining: ${activeGroups.length}`);
  console.log(`Total groups (including processed history): ${allGroups.length}`);
  console.log(`Processed groups successfully excluded: ${allGroups.length - activeGroups.length}`);
}

testGroupCount().catch(console.error);
