import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { VolunteerMutationService } from '../lib/services/volunteer-mutation.service';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const testActor = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'Phase 1 Security Test Runner',
  role: 'Admin',
};

async function runPhase1Tests() {
  console.log('===========================================================');
  console.log('  RUNNING FASE 1 MUTATIONS & SERVER-SIDE BOUNDARY SUITE   ');
  console.log('===========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${testName} -> ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // Cleanup array to delete test records created during test execution
  const cleanupIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // SETUP: Seed unique test volunteers in DB
    // -------------------------------------------------------------------------
    // Voluntario A en BD con formato local "87009911"
    const seedPhoneA = '87009911';
    const seedA = await VolunteerMutationService.createVolunteer(
      { firstName: 'TestVolA', lastName: 'Seed', phone: seedPhoneA },
      testActor
    );
    if (seedA.volunteer?.id) cleanupIds.push(seedA.volunteer.id);

    // Voluntario B en BD con formato E.164 "+50587009922"
    const seedPhoneB = '+50587009922';
    const seedB = await VolunteerMutationService.createVolunteer(
      { firstName: 'TestVolB', lastName: 'Seed', phone: seedPhoneB },
      testActor
    );
    if (seedB.volunteer?.id) cleanupIds.push(seedB.volunteer.id);

    // Voluntario C Archivado con teléfono "87009933"
    const seedPhoneC = '87009933';
    const seedC = await VolunteerMutationService.createVolunteer(
      { firstName: 'TestVolC', lastName: 'ArchivedSeed', phone: seedPhoneC },
      testActor
    );
    if (seedC.volunteer?.id) {
      cleanupIds.push(seedC.volunteer.id);
      await VolunteerMutationService.updateStatus(
        { volunteerId: seedC.volunteer.id, toStatus: 'archived' },
        testActor
      );
    }

    // -------------------------------------------------------------------------
    // TEST 1: createVolunteer con "87009922" cuando BD tiene "+50587009922" -> REJECTED
    // -------------------------------------------------------------------------
    const res1 = await VolunteerMutationService.createVolunteer(
      { firstName: 'Conflict1', lastName: 'Test', phone: '87009922' },
      testActor
    );
    assert(!res1.success && !!res1.error, 'TEST 1: createVolunteer "87009922" cuando BD tiene "+50587009922" -> REJECTED');

    // -------------------------------------------------------------------------
    // TEST 2: createVolunteer con "+50587009911" cuando BD tiene "87009911" -> REJECTED
    // -------------------------------------------------------------------------
    const res2 = await VolunteerMutationService.createVolunteer(
      { firstName: 'Conflict2', lastName: 'Test', phone: '+50587009911' },
      testActor
    );
    assert(!res2.success && !!res2.error, 'TEST 2: createVolunteer "+50587009911" cuando BD tiene "87009911" -> REJECTED');

    // -------------------------------------------------------------------------
    // TEST 3: createVolunteer con teléfono completamente diferente -> ALLOWED
    // -------------------------------------------------------------------------
    const uniquePhone = '87009999';
    const res3 = await VolunteerMutationService.createVolunteer(
      { firstName: 'UniqueVol', lastName: 'Test', phone: uniquePhone },
      testActor
    );
    assert(res3.success && !!res3.volunteer?.id, 'TEST 3: createVolunteer con teléfono libre -> ALLOWED');
    if (res3.volunteer?.id) cleanupIds.push(res3.volunteer.id);

    // -------------------------------------------------------------------------
    // TEST 4: updateProfile cambiando Voluntario A al teléfono activo de B -> REJECTED
    // -------------------------------------------------------------------------
    if (seedA.volunteer?.id) {
      const res4 = await VolunteerMutationService.updateProfile(
        seedA.volunteer.id,
        { firstName: 'TestVolA', lastName: 'Seed', phone: '+50587009922' }, // Teléfono de Vol B
        testActor
      );
      assert(!res4.success && !!res4.error, 'TEST 4: updateProfile cambiando A al teléfono activo de B -> REJECTED');
    }

    // -------------------------------------------------------------------------
    // TEST 5: updateProfile manteniendo su propio teléfono -> ALLOWED
    // -------------------------------------------------------------------------
    if (seedA.volunteer?.id) {
      const res5 = await VolunteerMutationService.updateProfile(
        seedA.volunteer.id,
        { firstName: 'TestVolA_UpdatedName', lastName: 'Seed', phone: seedPhoneA },
        testActor
      );
      assert(res5.success, 'TEST 5: updateProfile manteniendo su propio teléfono -> ALLOWED');
    }

    // -------------------------------------------------------------------------
    // TEST 6: bulkImport con dos filas equivalentes ("87009944" y "+50587009944") -> 2da rechazada
    // -------------------------------------------------------------------------
    const res6 = await VolunteerMutationService.bulkImportVolunteers(
      [
        { firstName: 'Bulk1', lastName: 'Intra', phone: '87009944' },
        { firstName: 'Bulk2', lastName: 'Intra', phone: '+50587009944' },
      ],
      testActor
    );
    assert(res6.importedCount === 1 && res6.skippedCount === 1, 'TEST 6: bulkImport con 2 filas equivalentes ignora duplicado intra-batch');
    if (res6.importedVolunteers[0]?.id) cleanupIds.push(res6.importedVolunteers[0].id);

    // -------------------------------------------------------------------------
    // TEST 7: bulkImport contra teléfono existente en BD ("+50587009911") -> REJECTED
    // -------------------------------------------------------------------------
    const res7 = await VolunteerMutationService.bulkImportVolunteers(
      [{ firstName: 'BulkDBConflict', lastName: 'Test', phone: '+50587009911' }],
      testActor
    );
    assert(res7.importedCount === 0 && res7.skippedCount === 1, 'TEST 7: bulkImport contra teléfono activo en BD -> REJECTED');

    // -------------------------------------------------------------------------
    // TEST 8: restore archived -> active con teléfono ocupado por B -> REJECTED
    // -------------------------------------------------------------------------
    if (seedC.volunteer?.id) {
      const res8 = await VolunteerMutationService.updateStatus(
        { volunteerId: seedC.volunteer.id, toStatus: 'active', newPhone: seedPhoneB },
        testActor
      );
      assert(!res8.success && res8.reason === 'phone_conflict', 'TEST 8: restore archived -> active con teléfono ocupado -> REJECTED');
    }

    // -------------------------------------------------------------------------
    // TEST 9: restore archived -> active con teléfono libre -> ALLOWED
    // -------------------------------------------------------------------------
    if (seedC.volunteer?.id) {
      const res9 = await VolunteerMutationService.updateStatus(
        { volunteerId: seedC.volunteer.id, toStatus: 'active' },
        testActor
      );
      assert(res9.success, 'TEST 9: restore archived -> active con teléfono libre -> ALLOWED');
    }

    // -------------------------------------------------------------------------
    // TEST 10: swapVolunteerActivation sin falsos positivos
    // -------------------------------------------------------------------------
    if (seedA.volunteer?.id && seedC.volunteer?.id) {
      // Activo A y Archivado C
      const res10 = await VolunteerMutationService.swapVolunteerActivation(
        seedA.volunteer.id,
        seedC.volunteer.id,
        testActor
      );
      assert(res10.success, 'TEST 10: swapVolunteerActivation funciona correctamente sin falsos positivos de teléfono');
    }

    // -------------------------------------------------------------------------
    // TEST 11: Verificar que NO exista ningún .maybeSingle() por teléfono en VolunteerMutationService
    // -------------------------------------------------------------------------
    const serviceContent = fs.readFileSync(
      path.join(process.cwd(), 'lib/services/volunteer-mutation.service.ts'),
      'utf-8'
    );
    const phoneQueries = serviceContent.split('\n').filter(line => line.includes(".in('phone'") || line.includes(".eq('phone'"));
    const hasMaybeSingleOnPhone = phoneQueries.some(line => line.includes("maybeSingle"));
    assert(!hasMaybeSingleOnPhone, 'TEST 11: No existe ningún .maybeSingle() por teléfono en VolunteerMutationService');

    // -------------------------------------------------------------------------
    // TEST 12: Verificar que NO se consulten columnas inexistentes
    // (is_shared_phone, phone_normalized, shared_phone_owner_id)
    // -------------------------------------------------------------------------
    const forbiddenColumns = ['is_shared_phone', 'phone_normalized', 'shared_phone_owner_id', 'shared_phone_reason'];
    const usesForbiddenCols = forbiddenColumns.some(col => serviceContent.includes(col));
    assert(!usesForbiddenCols, 'TEST 12: Ninguna operación de Fase 1 consulta columnas inexistentes (is_shared_phone, etc.)');

  } catch (err: any) {
    console.error('EXCEPTION EN PRUEBAS FASE 1:', err);
    failed++;
  } finally {
    // Cleanup temporary test records in Supabase
    if (cleanupIds.length > 0) {
      await supabase.from('volunteers').delete().in('id', cleanupIds);
      await supabase.from('activity_logs').delete().in('target_id', cleanupIds);
    }
  }

  console.log('\n===========================================================');
  console.log(`  FASE 1 TEST RESULTS: ${passed} PASSED, ${failed} FAILED  `);
  console.log('===========================================================');
}

runPhase1Tests().catch(console.error);
