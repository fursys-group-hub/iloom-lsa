import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('studentId');

  const supabase = getSupabase();
  let query = supabase
    .from('benchmarks')
    .select('*, students!inner(id, name, store_location)')
    .order('week_number', { ascending: true });

  if (studentId) query = query.eq('student_id', studentId);

  const { data, error } = await query;
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json(data || []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { studentId, weekNumber, targetName, targetRole, storeName, learnings, actionPlan } = body;

  if (!studentId || !weekNumber || !targetName || !learnings) {
    return Response.json({ message: '필수 정보가 부족해요.' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('benchmarks')
    .upsert(
      {
        student_id: studentId,
        week_number: weekNumber,
        target_name: targetName,
        target_role: targetRole || null,
        store_name: storeName || null,
        learnings,
        action_plan: actionPlan || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,week_number' }
    )
    .select()
    .single();

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json(data);
}
