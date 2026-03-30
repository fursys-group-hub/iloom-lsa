import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';

// GET: 평가 목록 조회
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const batchId = searchParams.get('batchId');
  const studentId = searchParams.get('studentId');
  const weekNumber = searchParams.get('weekNumber');

  const supabase = getSupabase();

  let query = supabase
    .from('weekly_evaluations')
    .select('*, students!inner(id, name, batch_id, store_location), managers(id, name, store_name)')
    .order('week_number', { ascending: true });

  if (batchId) {
    query = query.eq('students.batch_id', batchId);
  }
  if (studentId) {
    query = query.eq('student_id', studentId);
  }
  if (weekNumber) {
    query = query.eq('week_number', parseInt(weekNumber));
  }

  const { data, error } = await query;

  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json(data || []);
}

// POST: 평가 작성/수정 (upsert)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    studentId,
    managerId,
    weekNumber,
    rpArea,
    status,
    strengthTags,
    improvementTags,
    comment,
  } = body;

  if (!studentId || !managerId || !weekNumber) {
    return Response.json({ message: '필수 정보가 부족해요.' }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('weekly_evaluations')
    .upsert(
      {
        student_id: studentId,
        manager_id: managerId,
        week_number: weekNumber,
        rp_area: rpArea || null,
        status: status || 'completed',
        strength_tags: strengthTags || [],
        improvement_tags: improvementTags || [],
        comment: comment || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,week_number' }
    )
    .select()
    .single();

  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json(data);
}
