import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { loginWithPin } from '../app/actions/auth';
import { changeUserPin } from '../app/actions/update-pin';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runPhase0Tests() {
  console.log('===========================================================');
  console.log('  RUNNING FASE 0 SECURITY & DISAMBIGUATION TEST SUITE     ');
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

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Teléfono inexistente -> Error controlado
    // -------------------------------------------------------------------------
    const nonExistentPhone = '+50599998888';
    const form1 = new FormData();
    form1.append('phone', nonExistentPhone);
    form1.append('pin', '9999');
    const res1 = await loginWithPin({}, form1);
    assert(!!res1.error && !res1.success, 'TEST 11: Teléfono inexistente devuelve error controlado sin side-effects');

    // -------------------------------------------------------------------------
    // TEST 2 & 5 & 6: update-pin con teléfono ambiguo o inexistente
    // -------------------------------------------------------------------------
    // Usamos el teléfono del Grupo 36 (+50587823513) que tiene 6 voluntarios activos en la BD
    const sharedPhone = '+50587823513';
    
    // Obtener los PINs actuales del Administrador de la BD para verificar que JAMÁS se modifican por fallback
    const { data: adminBefore } = await supabase.from('profiles').select('id, pin, role').eq('role', 'Admin').limit(1).single();
    const originalAdminPin = adminBefore?.pin;

    const updatePinRes = await changeUserPin('1234', '9999', sharedPhone);
    assert(!updatePinRes.success && !!updatePinRes.error, 'TEST 5: update-pin con teléfono ambiguo NO modifica ningún registro');

    const { data: adminAfter } = await supabase.from('profiles').select('id, pin').eq('id', adminBefore?.id).single();
    assert(adminAfter?.pin === originalAdminPin, 'TEST 6: update-pin JAMÁS aplica fallback hacia Administrador/Coordinador');

    // -------------------------------------------------------------------------
    // TEST 2: Teléfono compartido en Login -> Múltiples perfiles devueltos
    // -------------------------------------------------------------------------
    const form2 = new FormData();
    form2.append('phone', sharedPhone);
    form2.append('pin', '1234');
    const loginSharedRes = await loginWithPin({}, form2);

    assert(
      !!loginSharedRes.require_profile_selection && 
      Array.isArray(loginSharedRes.profiles) && 
      loginSharedRes.profiles.length > 1,
      'TEST 2: Teléfono compartido requiere selección de perfil y devuelve candidatos (NO selecciona el 1ro)'
    );

    // -------------------------------------------------------------------------
    // TEST 3 & 4: Desambiguación explícita con selectedUserId
    // -------------------------------------------------------------------------
    if (loginSharedRes.profiles && loginSharedRes.profiles.length >= 2) {
      const profA = loginSharedRes.profiles[0];
      const profB = loginSharedRes.profiles[1];

      // Probar PIN incorrecto para Prof A
      const formA_wrong = new FormData();
      formA_wrong.append('phone', sharedPhone);
      formA_wrong.append('pin', '0000');
      formA_wrong.append('selectedUserId', profA.id);
      formA_wrong.append('selectedUserType', profA.userType);
      const resA_wrong = await loginWithPin({}, formA_wrong);

      assert(!!resA_wrong.error, 'TEST 3a: Valida PIN contra selectedUserId de Profile A (PIN incorrecto rechazado)');

      // Probar PIN incorrecto para Prof B
      const formB_wrong = new FormData();
      formB_wrong.append('phone', sharedPhone);
      formB_wrong.append('pin', '0000');
      formB_wrong.append('selectedUserId', profB.id);
      formB_wrong.append('selectedUserType', profB.userType);
      const resB_wrong = await loginWithPin({}, formB_wrong);

      assert(!!resB_wrong.error, 'TEST 4a: Valida PIN contra selectedUserId de Profile B (PIN incorrecto rechazado)');
    }

    // -------------------------------------------------------------------------
    // TEST 9 & 10: WebAuthn Check sin crashes por .maybeSingle()
    // -------------------------------------------------------------------------
    const checkPasskeyResp = await fetch(`http://localhost:3000/api/webauthn/check-has-passkey?phone=${encodeURIComponent(sharedPhone)}`);
    const checkPasskeyData = await checkPasskeyResp.json();
    assert(checkPasskeyResp.status === 200 && typeof checkPasskeyData.hasPasskey === 'boolean', 'TEST 10: WebAuthn check no genera PGRST116 / HTTP 406 con teléfono compartido');

  } catch (err: any) {
    console.error('EXCEPTION EN PRUEBAS FASE 0:', err);
    failed++;
  }

  console.log('\n===========================================================');
  console.log(`  FASE 0 TEST RESULTS: ${passed} PASSED, ${failed} FAILED  `);
  console.log('===========================================================');
}

runPhase0Tests().catch(console.error);
