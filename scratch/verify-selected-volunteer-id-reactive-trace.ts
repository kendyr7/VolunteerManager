import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { VolunteerMutationService } from '../lib/services/volunteer-mutation.service';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

const systemActor = { name: 'Reactive Audit', role: 'Coordinator' as const };

async function verifyReactiveSelectedVolunteerIdTrace() {
  console.log('===========================================================');
  console.log('  VERIFYING REACTIVE SELECTED VOLUNTEER ID TRACE          ');
  console.log('===========================================================\n');

  const selectedVolunteerId = 'a8412ac2-392d-4ab4-b3ae-ae68ea3e22cc'; // Marina

  // 1. Initial State before edit
  const { data: initialVol } = await supabase
    .from('volunteers')
    .select('id, first_name, last_name, phone, neighborhood, updated_at')
    .eq('id', selectedVolunteerId)
    .single();

  console.log('1. SELECTED VOLUNTEER ID STATE:');
  console.log('   selectedVolunteerId:', selectedVolunteerId);
  console.log('   rawVolunteers BEFORE Realtime neighborhood:', initialVol?.neighborhood);
  console.log('   rawVolunteers BEFORE Realtime updated_at:', initialVol?.updated_at);
  console.log('-----------------------------------------------------------\n');

  // 2. Perform edit (simulate Drawer save)
  const testBarrio = `Barrio_Reactive_${Date.now().toString().slice(-4)}`;
  console.log(`2. EXECUTING PROFILE MUTATION: neighborhood -> "${testBarrio}"...`);

  const res = await VolunteerMutationService.updateProfile(
    selectedVolunteerId,
    {
      firstName: initialVol!.first_name,
      lastName: initialVol!.last_name,
      phone: initialVol!.phone,
      neighborhood: testBarrio,
    },
    systemActor
  );

  console.log('   Mutation Result:', res);

  // 3. Query DB after Realtime event commit
  const { data: afterVol } = await supabase
    .from('volunteers')
    .select('id, first_name, neighborhood, updated_at')
    .eq('id', selectedVolunteerId)
    .single();

  console.log('\n3. REACTIVE RECORD DERIVED FROM rawVolunteers AFTER REALTIME:');
  console.log('   selectedVolunteerId:', selectedVolunteerId);
  console.log('   rawVolunteers AFTER Realtime neighborhood:', afterVol?.neighborhood);
  console.log('   rawVolunteers AFTER Realtime updated_at:', afterVol?.updated_at);

  // 4. Value received by VolunteerProfileDrawer
  const drawerReceivedWard = afterVol?.neighborhood ?? initialVol?.neighborhood ?? '';
  console.log('\n4. VALUE RECEIVED FINALLY BY VolunteerProfileDrawer:');
  console.log('   activeVolunteer.ward:', drawerReceivedWard);
  console.log('   Drawer Chips & Table Ward Match?:', drawerReceivedWard === testBarrio ? 'YES ✅ (REACTIVE)' : 'NO ❌');

  // Revert to original neighborhood
  await VolunteerMutationService.updateProfile(
    selectedVolunteerId,
    {
      firstName: initialVol!.first_name,
      lastName: initialVol!.last_name,
      phone: initialVol!.phone,
      neighborhood: initialVol!.neighborhood,
    },
    systemActor
  );
  console.log('\n[REVERTED DB RECORD TO ORIGINAL]:', initialVol?.neighborhood);
}

verifyReactiveSelectedVolunteerIdTrace().catch(err => console.error(err));
