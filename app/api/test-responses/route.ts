import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const batchId = searchParams.get('batchId');
  const session = searchParams.get('session');

  const supabase = getSupabase();
  let query = supabase.from('test_responses').select('*');

  if (batchId) query = query.eq('batch_id', batchId);
  if (session) query = query.eq('session', session);

  const { data, error } = await query.order('question_id');
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ responses: data });
}
