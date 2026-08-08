import { PhoneCleanupReviewService } from '../lib/services/phone-cleanup-review.service';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testDrevelGroupProcessing() {
  console.log('--- TESTING DREVEL / JAQUELINE GROUP PROCESSING ---');
  const groups = await PhoneCleanupReviewService.getDuplicatePhoneGroups();
  const drevelGroup = groups.find(g => g.phoneNormalized === '+50588546327');

  if (!drevelGroup) {
    console.log('Drevel group not found in active duplicate groups!');
    return;
  }

  console.log(`Found Drevel group #${drevelGroup.groupId} (${drevelGroup.phoneNormalized}) with ${drevelGroup.volunteers.length} members:`);
  drevelGroup.volunteers.forEach(v => {
    console.log(`- ID: ${v.id} | Name: ${v.fullName} | Status: ${v.status} | ProposedAction: ${v.proposedAction} | ApprovedAction: ${v.approvedAction} | ProcStatus: ${v.processingStatus}`);
  });

  console.log('\nSubmitting group review decision for Drevel group...');
  // Simulate user selection:
  // Drevel active -> PHONE_OWNER
  // Drevel archived -> ARCHIVE_DUPLICATE
  // Jaqueline -> SHARED_PHONE (or corrected phone / KEEP)
  const vOwner = drevelGroup.volunteers.find(v => v.fullName.includes('Forbes') && v.status === 'active') || drevelGroup.volunteers[0];
  const vArchived = drevelGroup.volunteers.find(v => v.fullName.includes('forbes') && v.status === 'archived') || drevelGroup.volunteers[1];
  const vJaqueline = drevelGroup.volunteers.find(v => v.fullName.includes('Jaquline')) || drevelGroup.volunteers[2];

  const submitRes = await PhoneCleanupReviewService.submitGroupReviewDecision({
    phoneNormalized: drevelGroup.phoneNormalized,
    reviewStatus: 'APPROVED',
    reviewedBy: 'AdminDrevelTester',
    reviewerComment: 'Aprobado saneamiento de grupo Drevel / Jaqueline',
    sharedPhoneReason: 'Jaqueline y Drevel comparten o corrigen teléfono',
    decisions: [
      { volunteerId: vOwner.id, approvedAction: 'PHONE_OWNER' },
      { volunteerId: vArchived.id, approvedAction: 'ARCHIVE_DUPLICATE' },
      { volunteerId: vJaqueline.id, approvedAction: 'SHARED_PHONE', sharedPhoneOwnerId: vOwner.id },
    ],
  });

  console.log('Submit decision result:', submitRes);

  console.log('\nExecuting processApprovedDecisions...');
  const procRes = await PhoneCleanupReviewService.processApprovedDecisions('AdminDrevelTester');
  console.log('Process approved decisions result:', procRes);

  console.log('\nReloading groups to verify if group disappears from duplicate list...');
  const reloadedGroups = await PhoneCleanupReviewService.getDuplicatePhoneGroups();
  const reloadedDrevelGroup = reloadedGroups.find(g => g.phoneNormalized === '+50588546327');

  if (reloadedDrevelGroup) {
    console.log('❌ Drevel group STILL EXISTS in duplicate groups list!');
    console.log('Group status:', reloadedDrevelGroup.reviewStatus);
    reloadedDrevelGroup.volunteers.forEach(v => console.log(`  - ${v.fullName}: status=${v.status}, procStatus=${v.processingStatus}, isShared=${(v as any).is_shared_phone}`));
  } else {
    console.log('🎉 SUCCESS! Drevel group DISAPPEARED from duplicate groups list!');
  }
}

testDrevelGroupProcessing().catch(console.error);
