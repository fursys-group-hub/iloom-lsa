import { NextRequest } from 'next/server';
import { getSupabase, createServerClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const batchId = searchParams.get('batchId');
  const session = searchParams.get('session');
  const studentId = searchParams.get('studentId');

  const supabase = getSupabase();
  let query = supabase.from('test_responses').select('*');

  if (batchId) query = query.eq('batch_id', batchId);
  if (session) query = query.eq('session', session);
  if (studentId) query = query.eq('student_id', studentId);

  const { data, error } = await query.order('question_id');
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ responses: data });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const batchId = searchParams.get('batchId');
  const session = searchParams.get('session');
  const studentId = searchParams.get('studentId');

  if (!studentId || !session) {
    return Response.json({ message: 'studentId, session 이 필요합니다.' }, { status: 400 });
  }

  const supabase = createServerClient();

  let respQuery = supabase
    .from('test_responses')
    .delete()
    .eq('student_id', studentId)
    .eq('session', session);
  if (batchId) respQuery = respQuery.eq('batch_id', batchId);
  const { data: respDeleted, error: respErr } = await respQuery.select('id');
  if (respErr) return Response.json({ message: respErr.message }, { status: 500 });

  const { data: scoreDeleted, error: scoreErr } = await supabase
    .from('test_scores')
    .delete()
    .eq('student_id', studentId)
    .eq('subject', session)
    .select('id');
  if (scoreErr) return Response.json({ message: scoreErr.message }, { status: 500 });

  return Response.json({
    message: `응시 기록이 삭제되었습니다. (응답 ${respDeleted?.length ?? 0}건, 점수 ${scoreDeleted?.length ?? 0}건)`,
  });
}
