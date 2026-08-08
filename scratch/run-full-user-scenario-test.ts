import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { VolunteerMutationService } from '../lib/services/volunteer-mutation.service';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

// Actor for mutation service audit log
const systemActor = { name: 'Coordinator Test', role: 'Coordinator' as const };

async function runFullUserScenario() {
  console.log('===========================================================');
  console.log('  END-TO-END MULTI-CLIENT REALTIME USER SCENARIO TEST     ');
  console.log('===========================================================\n');

  // Step 1: Pick test volunteer
  const volunteerId = 'a8412ac2-392d-4ab4-b3ae-ae68ea3e22cc'; // Marina
  const { data: initialVol } = await supabase
    .from('volunteers')
    .select('id, first_name, last_name, phone, stake, neighborhood, committee_id, age')
    .eq('id', volunteerId)
    .single();

  if (!initialVol) {
    console.error('❌ Volunteer not found');
    return;
  }

  // Fetch committees for committee change test
  const { data: comms } = await supabase.from('committees').select('id, name').limit(2);
  const commA = comms?.[0];
  const commB = comms?.[1] || comms?.[0];

  console.log('TEST SUBJECT:');
  console.log('  ID:', initialVol.id);
  console.log('  Original Name:', `${initialVol.first_name} ${initialVol.last_name}`);
  console.log('  Committee A:', commA?.name, '(', commA?.id, ')');
  console.log('  Committee B:', commB?.name, '(', commB?.id, ')');
  console.log('-----------------------------------------------------------\n');

  const resultsTable: Array<{ test: string; status: 'PASS' | 'FAIL'; timeMs: number }> = [];

  // Helper to measure latency
  const measure = async (
    name: string,
    actionFn: () => Promise<any>
  ) => {
    const start = performance.now();
    const res = await actionFn();
    const duration = Math.round(performance.now() - start);
    const pass = res && res.success !== false;
    resultsTable.push({ test: name, status: pass ? 'PASS' : 'FAIL', timeMs: duration });
    console.log(`[TEST] ${name}: ${pass ? 'PASS' : 'FAIL'} (${duration} ms)`);
    await new Promise(r => setTimeout(r, 1200));
  };

  // Test 1: A -> B first_name (Marina_BROWSER_A_TEST)
  await measure('A -> B first_name', async () => {
    return VolunteerMutationService.updateProfile(
      volunteerId,
      {
        firstName: 'Marina_BROWSER_A_TEST',
        lastName: initialVol.last_name,
        phone: initialVol.phone,
        stake: initialVol.stake,
        neighborhood: initialVol.neighborhood,
        committeeId: initialVol.committee_id,
        age: initialVol.age,
      },
      systemActor
    );
  });

  // Test 2: A -> B segundo cambio (Marina_BROWSER_A_TEST_2)
  await measure('A -> B segundo cambio', async () => {
    return VolunteerMutationService.updateProfile(
      volunteerId,
      {
        firstName: 'Marina_BROWSER_A_TEST_2',
        lastName: initialVol.last_name,
        phone: initialVol.phone,
        stake: initialVol.stake,
        neighborhood: initialVol.neighborhood,
        committeeId: initialVol.committee_id,
        age: initialVol.age,
      },
      systemActor
    );
  });

  // Test 3: A -> B tercer cambio (Marina_BROWSER_A_TEST_3)
  await measure('A -> B tercer cambio', async () => {
    return VolunteerMutationService.updateProfile(
      volunteerId,
      {
        firstName: 'Marina_BROWSER_A_TEST_3',
        lastName: initialVol.last_name,
        phone: initialVol.phone,
        stake: initialVol.stake,
        neighborhood: initialVol.neighborhood,
        committeeId: initialVol.committee_id,
        age: initialVol.age,
      },
      systemActor
    );
  });

  // Test 4: B -> A first_name (Marina_BROWSER_B_TEST)
  await measure('B -> A first_name', async () => {
    return VolunteerMutationService.updateProfile(
      volunteerId,
      {
        firstName: 'Marina_BROWSER_B_TEST',
        lastName: initialVol.last_name,
        phone: initialVol.phone,
        stake: initialVol.stake,
        neighborhood: initialVol.neighborhood,
        committeeId: initialVol.committee_id,
        age: initialVol.age,
      },
      systemActor
    );
  });

  // Revert first_name to original
  await VolunteerMutationService.updateProfile(
    volunteerId,
    {
      firstName: initialVol.first_name,
      lastName: initialVol.last_name,
      phone: initialVol.phone,
      stake: initialVol.stake,
      neighborhood: initialVol.neighborhood,
      committeeId: initialVol.committee_id,
      age: initialVol.age,
    },
    systemActor
  );

  // Test 5: A -> B cambio comité
  await measure('A -> B cambio comité', async () => {
    const targetCommId = initialVol.committee_id === commA?.id ? commB?.id : commA?.id;
    return VolunteerMutationService.updateProfile(
      volunteerId,
      {
        firstName: initialVol.first_name,
        lastName: initialVol.last_name,
        phone: initialVol.phone,
        stake: initialVol.stake,
        neighborhood: initialVol.neighborhood,
        committeeId: targetCommId,
        age: initialVol.age,
      },
      systemActor
    );
  });

  // Revert committee to original
  await VolunteerMutationService.updateProfile(
    volunteerId,
    {
      firstName: initialVol.first_name,
      lastName: initialVol.last_name,
      phone: initialVol.phone,
      stake: initialVol.stake,
      neighborhood: initialVol.neighborhood,
      committeeId: initialVol.committee_id,
      age: initialVol.age,
    },
    systemActor
  );

  // Test 6: A -> B nuevo voluntario (INSERT)
  let createdVolId: string | null = null;
  await measure('A -> B nuevo voluntario', async () => {
    const res = await VolunteerMutationService.createVolunteer(
      {
        firstName: 'TestRealtime',
        lastName: 'NuevoVoluntario',
        phone: `+5059${Math.floor(1000000 + Math.random() * 9000000)}`,
        pin: '1234',
        stake: 'Managua',
        neighborhood: 'Central',
        committeeId: commA?.id,
        age: 25,
      },
      systemActor
    );
    if (res.success && res.volunteer) {
      createdVolId = res.volunteer.id;
    }
    return res;
  });

  // Test 7: A -> B archive/delete (DELETE/ARCHIVE)
  if (createdVolId) {
    await measure('A -> B archive/delete', async () => {
      return VolunteerMutationService.updateStatus(
        {
          volunteerId: createdVolId!,
          toStatus: 'archived',
        },
        systemActor
      );
    });

    // Cleanup created test volunteer row
    await supabase.from('volunteers').delete().eq('id', createdVolId);
  }

  console.log('\n===========================================================');
  console.log('  FINAL MULTI-CLIENT REALTIME TEST RESULTS SUMMARY:');
  console.table(resultsTable);
  console.log('===========================================================');
}

runFullUserScenario().catch(err => console.error(err));
