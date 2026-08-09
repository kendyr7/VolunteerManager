import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { VolunteerMutationService } from '../lib/services/volunteer-mutation.service';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

const systemActor = { name: 'Audit Test', role: 'Coordinator' as const };

async function traceNeighborhoodMutation() {
  console.log('===========================================================');
  console.log('  NEIGHBORHOOD MUTATION & LOCAL STATE TRACE AUDIT         ');
  console.log('===========================================================\n');

  const volunteerId = 'a8412ac2-392d-4ab4-b3ae-ae68ea3e22cc'; // Marina

  // 1. Fetch record BEFORE mutation
  const { data: before } = await supabase
    .from('volunteers')
    .select('id, first_name, last_name, phone, neighborhood, updated_at')
    .eq('id', volunteerId)
    .single();

  console.log('[1. BEFORE MUTATION]:');
  console.log('  id:', before?.id);
  console.log('  first_name:', before?.first_name);
  console.log('  neighborhood in DB:', before?.neighborhood);
  console.log('  updated_at in DB:', before?.updated_at);
  console.log('-----------------------------------------------------------\n');

  // 2. Perform UPDATE via VolunteerMutationService (as UI does)
  const newNeighborhood = `Barrio_Test_${Date.now().toString().slice(-4)}`;
  console.log(`[2. EXECUTING MUTATION SERVICE]: updating neighborhood -> "${newNeighborhood}"...`);

  const mutationResult = await VolunteerMutationService.updateProfile(
    volunteerId,
    {
      firstName: before!.first_name,
      lastName: before!.last_name,
      phone: before!.phone,
      neighborhood: newNeighborhood,
    },
    systemActor
  );

  console.log('[3. MUTATION SERVICE RESPONSE]:', mutationResult);

  // 3. Immediately query DB to verify if PostgreSQL holds the new value
  const { data: after } = await supabase
    .from('volunteers')
    .select('id, first_name, neighborhood, updated_at')
    .eq('id', volunteerId)
    .single();

  console.log('\n[4. IMMEDIATE DB QUERY AFTER UPDATE]:');
  console.log('  id:', after?.id);
  console.log('  neighborhood in DB:', after?.neighborhood);
  console.log('  updated_at in DB:', after?.updated_at);

  const dbHasNewValue = after?.neighborhood === newNeighborhood;
  console.log('  DB holds new value immediately?:', dbHasNewValue ? 'YES ✅' : 'NO ❌');

  // 4. Revert to original neighborhood
  await VolunteerMutationService.updateProfile(
    volunteerId,
    {
      firstName: before!.first_name,
      lastName: before!.last_name,
      phone: before!.phone,
      neighborhood: before!.neighborhood,
    },
    systemActor
  );
  console.log('\n[5. REVERTED DB RECORD TO ORIGINAL]:', before?.neighborhood);
}

traceNeighborhoodMutation().catch(err => console.error(err));
