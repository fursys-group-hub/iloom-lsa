import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('studentId');

  const supabase = getSupabase();
  let query = supabase.from('test_scores').select('*').order('test_date');
  if (studentId) query = query.eq('student_id', studentId);

  const { data, error } = await query;
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ scores: data });
}
