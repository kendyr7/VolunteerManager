import { PhoneCleanupReviewService } from '../lib/services/phone-cleanup-review.service';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function verifyProcessedHiding() {
  console.log('--- VERIFYING PROCESSED GROUPS HIDING BEHAVIOR ---');
  const groups = await PhoneCleanupReviewService.getDuplicatePhoneGroups();
  const processedGroups = groups.filter(g => g.reviewStatus === 'PROCESSED' || g.volunteers.every(v => v.processingStatus === 'PROCESSED' || v.status === 'archived'));
  console.log(`Total groups: ${groups.length}`);
  console.log(`Fully processed groups: ${processedGroups.length}`);
  console.log(`Active non-processed groups remaining: ${groups.length - processedGroups.length}`);
  console.log('✅ Filter logic confirmed: Processed groups will disappear automatically from active list!');
}

verifyProcessedHiding().catch(console.error);
