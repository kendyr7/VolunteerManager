import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
const VOL_ID = "8b46a9fa-c5e3-48fa-ae68-c2df285a7133";

async function run() {
  console.log("=== PASO 1: Ultimos 20 logs ===");
  const { data: logs, error: e1 } = await sb
    .from("activity_logs")
    .select("id, action_type, target_id, description, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (e1) { console.log("ERROR:", JSON.stringify(e1)); return; }
  console.log("Total:", logs!.length);
  logs!.forEach((r: any, i: number) =>
    console.log(i, "|", r.action_type, "|", r.target_id, "|", (r.description||"").substring(0,50), "|", r.created_at)
  );

  console.log("\n=== PASO 2: target_id = VOL_ID directo ===");
  const { data: d2, error: e2 } = await sb
    .from("activity_logs")
    .select("id, action_type, target_id, description")
    .eq("target_id", VOL_ID);
  console.log("Direct match count:", d2 && d2.length, "error:", JSON.stringify(e2));

  console.log("\n=== PASO 2b: volunteer record ===");
  const { data: vol } = await sb
    .from("volunteers")
    .select("id, first_name, last_name, phone")
    .eq("id", VOL_ID)
    .maybeSingle();
  console.log("Vol:", JSON.stringify(vol));

  console.log("\n=== PASO 2c: shifts del voluntario ===");
  const { data: shifts } = await sb
    .from("shifts")
    .select("id, volunteer_id")
    .eq("volunteer_id", VOL_ID);
  console.log("Shifts count:", shifts && shifts.length);
  if (shifts && shifts.length > 0) {
    const ids = shifts.map((s: any) => s.id);
    const { data: sl } = await sb
      .from("activity_logs")
      .select("id, action_type, target_id, description")
      .in("target_id", ids);
    console.log("Shift logs:", sl && sl.length, JSON.stringify(sl && sl.slice(0,3)));
  }

  console.log("\n=== PASO 2d: todos los action_type distintos en activity_logs ===");
  const { data: all } = await sb
    .from("activity_logs")
    .select("action_type")
    .order("created_at", { ascending: false })
    .limit(500);
  const counts: Record<string, number> = {};
  (all || []).forEach((r: any) => { counts[r.action_type] = (counts[r.action_type] || 0) + 1; });
  console.log("Action type counts:", JSON.stringify(counts));
}
run().catch(console.error);
