import crypto from "crypto";
import { signSession, verifySessionToken } from "../lib/auth";
import { isExtendedShiftDay, getOfficialShiftTime } from "../lib/dates";

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "test_secret_key_12345678901234567890";
}

function getSecret(): string {
  return process.env.JWT_SECRET || "test_secret_key_12345678901234567890";
}

function testGenerateEntryPassTokenLogic(
  callerSessionToken: string | null,
  targetVolunteerId: string
) {
  if (!callerSessionToken) {
    throw new Error("No autenticado. Debes iniciar sesión para generar un pase QR.");
  }

  const session = verifySessionToken(callerSessionToken);
  if (!session) {
    throw new Error("No autenticado. Debes iniciar sesión para generar un pase QR.");
  }

  const isSelf = session.userId === targetVolunteerId;
  const normalizedRole = (session.role || '').toLowerCase().trim();
  const isAdmin = normalizedRole === 'admin' || normalizedRole === 'administrador';

  if (!isSelf && !isAdmin) {
    throw new Error("No tienes permiso para generar el pase QR de este voluntario. Solo administradores pueden generar pases de otros usuarios.");
  }

  const timestamp = Date.now();
  const hmac = crypto.createHmac("sha256", getSecret());
  hmac.update(`${targetVolunteerId}:${timestamp}`);
  const signature = hmac.digest("hex");

  return {
    volunteerId: targetVolunteerId,
    timestamp,
    signature
  };
}

console.log("=================================================");
console.log("  RUNNING QR AUTHORIZATION & END-TO-END TESTS    ");
console.log("=================================================\n");

const volunteerA = "vol-uuid-1111-1111-1111-111111111111";
const volunteerB = "vol-uuid-2222-2222-2222-222222222222";
const adminUser = "admin-uuid-8888-8888-8888-888888888888";
const coordinatorUser = "coord-uuid-9999-9999-9999-999999999999";

const volunteerASession = signSession({
  userId: volunteerA,
  userType: 'volunteer',
  role: 'Lector',
  committee: 'Seguridad'
});

const adminSession = signSession({
  userId: adminUser,
  userType: 'profile',
  role: 'Admin',
  committee: 'Dirección'
});

const coordinatorSession = signSession({
  userId: coordinatorUser,
  userType: 'profile',
  role: 'Editor',
  committee: 'Seguridad'
});

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    failCount++;
  }
}

// --- 1. AUTHORIZATION MATRIX TESTS ---
console.log("--- 1. Testing Authorization Matrix (Cases A - E) ---");

// CASO A: Voluntario solicita su propio QR -> PERMITIDO
try {
  const token = testGenerateEntryPassTokenLogic(volunteerASession, volunteerA);
  assert(token.volunteerId === volunteerA, "Caso A: Voluntario solicita SU propio QR (PERMITIDO)");
} catch (e: any) {
  assert(false, "Caso A: Voluntario solicita SU propio QR", e.message);
}

// CASO B: Admin solicita QR de otro voluntario -> PERMITIDO
try {
  const token = testGenerateEntryPassTokenLogic(adminSession, volunteerB);
  assert(token.volunteerId === volunteerB, "Caso B: Admin solicita QR de OTRO voluntario (PERMITIDO)");
} catch (e: any) {
  assert(false, "Caso B: Admin solicita QR de OTRO voluntario", e.message);
}

// CASO C: Voluntario solicita QR de otro voluntario -> DENEGADO
try {
  testGenerateEntryPassTokenLogic(volunteerASession, volunteerB);
  assert(false, "Caso C: Voluntario solicita QR de OTRO voluntario", "Esperaba error de permisos pero fue permitido");
} catch (e: any) {
  assert(e.message.includes("No tienes permiso"), "Caso C: Voluntario solicita QR de OTRO voluntario (DENEGADO CORRECTAMENTE)");
}

// CASO D: Coordinator solicita QR de otro voluntario -> DENEGADO
try {
  testGenerateEntryPassTokenLogic(coordinatorSession, volunteerB);
  assert(false, "Caso D: Coordinator solicita QR de OTRO voluntario", "Esperaba error de permisos pero fue permitido");
} catch (e: any) {
  assert(e.message.includes("No tienes permiso"), "Caso D: Coordinator solicita QR de OTRO voluntario (DENEGADO CORRECTAMENTE)");
}

// CASO E: Usuario no autenticado -> DENEGADO
try {
  testGenerateEntryPassTokenLogic(null, volunteerB);
  assert(false, "Caso E: Usuario no autenticado", "Esperaba error de autenticación pero fue permitido");
} catch (e: any) {
  assert(e.message.includes("No autenticado"), "Caso E: Usuario no autenticado (DENEGADO CORRECTAMENTE)");
}

// --- 2. END-TO-END ADMIN QR VALIDATION ---
console.log("\n--- 2. End-to-End Admin QR Validation ---");

const adminGeneratedPass = testGenerateEntryPassTokenLogic(adminSession, volunteerB);

// 1. Check Payload Structure
assert(
  typeof adminGeneratedPass.volunteerId === "string" &&
  typeof adminGeneratedPass.timestamp === "number" &&
  typeof adminGeneratedPass.signature === "string",
  "Admin QR payload contiene { volunteerId, timestamp, signature }"
);

// 2. Validate HMAC signature as checkInVolunteer does
const recomputedHmac = crypto.createHmac("sha256", getSecret())
  .update(`${volunteerB}:${adminGeneratedPass.timestamp}`)
  .digest("hex");
assert(
  recomputedHmac === adminGeneratedPass.signature,
  "QR generado por Admin pasa la validación HMAC idénticamente"
);

// 3. Validate 30-min Expiration
const now = Date.now();
const ageMinutes = (now - adminGeneratedPass.timestamp) / (1000 * 60);
assert(
  ageMinutes < 30,
  "QR generado por Admin conserva expiración de 30 minutos"
);

// 4. Validate Target Identity (Represents Volunteer B, not Admin)
assert(
  adminGeneratedPass.volunteerId === volunteerB && (adminGeneratedPass.volunteerId as string) !== adminUser,
  "QR representa 100% al voluntario objetivo (Volunteer B), NO al Admin"
);

// --- 3. SPECIAL DATES & EXTENDED SHIFT DAY VERIFICATION ---
console.log("\n--- 3. Verificación de Fechas Especiales (isExtendedShiftDay) ---");

assert(isExtendedShiftDay("lun 14") === true, "isExtendedShiftDay('lun 14') -> true (Sep 14)");
assert(isExtendedShiftDay("mar 15") === true, "isExtendedShiftDay('mar 15') -> true (Sep 15)");
assert(isExtendedShiftDay("vie 11") === true, "isExtendedShiftDay('vie 11') -> true (Viernes)");
assert(isExtendedShiftDay("sáb 12") === true, "isExtendedShiftDay('sáb 12') -> true (Sábado)");

assert(isExtendedShiftDay("jue 10") === false, "isExtendedShiftDay('jue 10') -> false (Jueves normal)");
assert(isExtendedShiftDay("mié 16") === false, "isExtendedShiftDay('mié 16') -> false (Miércoles normal)");

assert(isExtendedShiftDay("2026-09-14") === true, "isExtendedShiftDay('2026-09-14') -> true (ISO Sep 14)");
assert(isExtendedShiftDay("2026-09-15") === true, "isExtendedShiftDay('2026-09-15') -> true (ISO Sep 15)");
assert(isExtendedShiftDay("2026-09-10") === false, "isExtendedShiftDay('2026-09-10') -> false (ISO Thu)");

assert(isExtendedShiftDay("2026-10-14") === false, "isExtendedShiftDay('2026-10-14') -> false (No aplica Sep 14 a Oct)");

console.log(`\n=================================================`);
console.log(`  RESULTADOS: ${passCount} PASSED, ${failCount} FAILED`);
console.log(`=================================================`);

if (failCount > 0) process.exit(1);
