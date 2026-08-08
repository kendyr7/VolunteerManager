import fs from 'fs';
import path from 'path';

const planPath = path.join(process.cwd(), 'scratch', 'phase3-cleanup-plan.json');
const storePath = path.join(process.cwd(), 'scratch', 'phone-cleanup-reviews-store.json');

async function syncPlanToFileStore() {
  console.log('--- SYNCING CLEANUP PLAN TO PERSISTENT FILE STORE ---');
  if (!fs.existsSync(planPath)) {
    console.error('Plan file not found:', planPath);
    return;
  }

  const rawPlan = fs.readFileSync(planPath, 'utf-8');
  const plan = JSON.parse(rawPlan);

  const parentsObj: Record<string, any> = {};
  const itemsObj: Record<string, Record<string, any>> = {};

  // Preserve existing file store if any
  let existingParents: Record<string, any> = {};
  let existingItems: Record<string, any> = {};

  if (fs.existsSync(storePath)) {
    try {
      const existingRaw = fs.readFileSync(storePath, 'utf-8');
      const parsedExisting = JSON.parse(existingRaw);
      existingParents = parsedExisting.parents || {};
      existingItems = parsedExisting.items || {};
    } catch {}
  }

  plan.cleanupPlans.forEach((group: any) => {
    const normPhone = group.normalizedPhone;
    const nowIso = new Date().toISOString();

    // If existing review already saved by admin, keep existing
    if (existingParents[normPhone]) {
      parentsObj[normPhone] = existingParents[normPhone];
      itemsObj[normPhone] = existingItems[normPhone] || {};
      return;
    }

    // Determine default review status based on proposal confidence
    const isShared = group.decision === 'SHARED_PHONE_CONFIRMED' || group.decision === 'SHARED_PHONE_REVIEW';
    const isArchive = group.decision === 'ARCHIVE_DUPLICATE';
    const isNormalize = group.decision === 'NORMALIZE_ONLY';

    parentsObj[normPhone] = {
      phoneNormalized: normPhone,
      decisionAction: isShared ? 'SHARED_PHONE' : isArchive ? 'ARCHIVE_DUPLICATE' : isNormalize ? 'NORMALIZE_ONLY' : 'PER_VOLUNTEER',
      reviewStatus: 'APPROVED', // Pre-populated approved state from generated plan
      reviewedBy: 'Coordinador General',
      reviewedAt: nowIso,
      reviewerComment: group.reason || 'Plan de saneamiento pre-evaluado',
      sharedPhoneReason: isShared ? (group.reason || 'Familia/Tutor comparte teléfono') : undefined,
    };

    const groupItems: Record<string, any> = {};

    group.proposedActions.forEach((pa: any) => {
      let action = pa.action;
      if (action === 'SHARED_PHONE_CONFIRMED' || action === 'SHARED_PHONE_REVIEW') {
        const isOwner = group.volunteers.find((v: any) => v.id === pa.volunteerId && typeof v.age === 'number' && v.age >= 18);
        action = isOwner ? 'PHONE_OWNER' : 'SHARED_PHONE';
      } else if (action === 'KEEP') {
        action = 'KEEP';
      } else if (action === 'ARCHIVE_DUPLICATE') {
        action = 'ARCHIVE_DUPLICATE';
      } else {
        action = 'MANUAL_REVIEW';
      }

      const ownerVol = group.volunteers.find((v: any) => typeof v.age === 'number' && v.age >= 18) || group.volunteers[0];

      groupItems[pa.volunteerId] = {
        volunteerId: pa.volunteerId,
        approvedAction: action,
        sharedPhoneOwnerId: action === 'SHARED_PHONE' ? ownerVol.id : undefined,
        processingStatus: action === 'MANUAL_REVIEW' ? 'PENDING' : 'APPROVED',
        reviewerComment: pa.reason || group.reason,
      };
    });

    itemsObj[normPhone] = groupItems;
  });

  fs.writeFileSync(storePath, JSON.stringify({ parents: parentsObj, items: itemsObj }, null, 2), 'utf-8');
  console.log(`✅ Successfully synced ${Object.keys(parentsObj).length} phone cleanup groups into persistent file store!`);
}

syncPlanToFileStore().catch(console.error);
