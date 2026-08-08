import { PhoneCleanupReviewService } from '../lib/services/phone-cleanup-review.service';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkRestoredStore() {
  const groups = await PhoneCleanupReviewService.getDuplicatePhoneGroups();
  const approvedCount = groups.filter(g => g.reviewStatus === 'APPROVED').length;
  console.log('Total groups loaded:', groups.length);
  console.log('Approved review groups restored:', approvedCount);
}

checkRestoredStore().catch(console.error);
