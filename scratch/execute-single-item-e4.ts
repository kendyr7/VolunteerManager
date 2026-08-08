import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { PhoneCleanupProcessingService } from '../lib/services/phone-cleanup-processing.service';
import { AuditActor } from '../lib/services/volunteer-audit-writer';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function executeSingleControlledMutation() {
  console.log('===========================================================');
  console.log('  EJECUCIÓN CONTROLADA DE 1 SOLO VOLUNTARIO CANDIDATO      ');
  console.log('===========================================================\n');

  const itemId = '31b06dfd-a9b9-43aa-9e1d-8adbdea2aa39';
  const volunteerId = '38de64f0-89d6-4f95-acf4-35b3367d9798';
  const actor: AuditActor = { name: 'Administrador', role: 'Administrador' };

  // 1. Pre-execution checks
  const { data: volBefore } = await supabase
    .from('volunteers')
    .select('id, first_name, last_name, phone, phone_normalized, is_shared_phone, shared_phone_owner_id')
    .eq('id', volunteerId)
    .single();

  const { data: itemBefore } = await supabase
    .from('phone_cleanup_review_items')
    .select('*')
    .eq('id', itemId)
    .single();

  console.log('1. ESTADO PREVIO A LA MUTACIÓN:');
  console.log(`  - Voluntario: ${volBefore?.first_name} ${volBefore?.last_name} (${volBefore?.id})`);
  console.log(`  - Teléfono actual: ${volBefore?.phone}`);
  console.log(`  - phone_normalized actual: ${volBefore?.phone_normalized}`);
  console.log(`  - is_shared_phone actual: ${volBefore?.is_shared_phone}`);
  console.log(`  - Item decision: ${itemBefore?.decision}`);
  console.log(`  - Item status: ${itemBefore?.status}`);
  console.log(`  - Item processing_status: ${itemBefore?.processing_status}\n`);

  // 2. Execute LIVE MUTATION for this 1 single item (dryRun = false)
  console.log('2. EJECUTANDO MUTACIÓN REAL EN public.volunteers PARA 1 VOLUNTARIO...');
  const res = await PhoneCleanupProcessingService.processSingleItem(itemId, actor, false);

  console.log(`\nRESULTADO DE LA MUTACIÓN:`, res);

  // 3. Post-execution verification
  const { data: volAfter } = await supabase
    .from('volunteers')
    .select('id, first_name, last_name, phone, phone_normalized, is_shared_phone, shared_phone_owner_id')
    .eq('id', volunteerId)
    .single();

  const { data: itemAfter } = await supabase
    .from('phone_cleanup_review_items')
    .select('*')
    .eq('id', itemId)
    .single();

  const { data: logs } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('volunteer_id', volunteerId)
    .order('created_at', { ascending: false })
    .limit(1);

  console.log('\n3. VERIFICACIÓN POST-EJECUCIÓN:');
  console.log(`  - Voluntario phone_normalized: "${volAfter?.phone_normalized}" ${volAfter?.phone_normalized === '+50589510000' ? '✅' : '❌'}`);
  console.log(`  - Voluntario is_shared_phone: ${volAfter?.is_shared_phone} ${volAfter?.is_shared_phone === false ? '✅' : '❌'}`);
  console.log(`  - Voluntario shared_phone_owner_id: ${volAfter?.shared_phone_owner_id} ${volAfter?.shared_phone_owner_id === null ? '✅' : '❌'}`);
  console.log(`  - Item status: "${itemAfter?.status}" ${itemAfter?.status === 'PROCESSED' ? '✅' : '❌'}`);
  console.log(`  - Item processing_status: "${itemAfter?.processing_status}" ${itemAfter?.processing_status === 'PROCESSED' ? '✅' : '❌'}`);
  console.log(`  - Item processed_at: ${itemAfter?.processed_at} ${itemAfter?.processed_at ? '✅' : '❌'}`);
  console.log(`  - Item processed_by: "${itemAfter?.processed_by}" ${itemAfter?.processed_by === 'Administrador' ? '✅' : '❌'}`);
  console.log(`  - Activity log creado: ${logs && logs.length > 0 ? 'SÍ (' + logs[0].description + ')' : 'NO'}`);

  console.log('\n===========================================================');
  console.log('FASE E4 CONTROLLED EXECUTION: COMPLETE');
  console.log('VOLUNTEERS MODIFICADOS DE FORMA REAL: 1');
  console.log('===========================================================');
}

executeSingleControlledMutation().catch(console.error);
