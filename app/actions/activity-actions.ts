'use server';

import { createClient } from "@supabase/supabase-js";

export type ActivityLog = {
  id: string;
  user_name: string;
  user_role: string;
  action_type: string;
  description: string;
  details: string | null;
  target_id: string | null;
  created_at: string;
};

export async function getActivityLogs(limit = 100): Promise<ActivityLog[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching activity logs:", error);
    return [];
  }

  return (data || []) as ActivityLog[];
}

export async function createActivityLog({
  userName,
  userRole,
  actionType,
  description,
  details,
  targetId
}: {
  userName: string;
  userRole: string;
  actionType: string;
  description: string;
  details?: string;
  targetId?: string;
}): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { error } = await supabase
    .from('activity_logs')
    .insert({
      user_name: userName,
      user_role: userRole,
      action_type: actionType,
      description,
      details: details || null,
      target_id: targetId || null
    });

  if (error) {
    console.error("Error creating activity log:", error);
    return false;
  }

  return true;
}
