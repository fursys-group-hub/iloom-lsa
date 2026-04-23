import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';

/**
 * GET /api/advanced-questions?batch_id=...&week=1&session=1
 *
 * 특정 기수의 (주차, 차시)에 해당하는 심화교육 문제은행을
 * 문제번호 순으로 반환.
 */
export async function GET(req: NextRequest) {
  const batchId = req.nextUrl.searchParams.get('batch_id');
  const week = req.nextUrl.searchParams.get('week');
  const session = req.nextUrl.searchParams.get('session') || '1';

  if (!batchId || !week) {
    return Response.json({ message: 'batch_id, week이 필요합니다.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('advanced_questions')
    .select('*')
    .eq('batch_id', batchId)
    .eq('week_number', Number(week))
    .eq('session', Number(session));

  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  // 문제번호(question_id)는 "1", "2", "10" 등 문자열 → 숫자 정렬
  const sorted = (data || []).slice().sort((a, b) => {
    const an = parseInt(a.question_id, 10) || 0;
    const bn = parseInt(b.question_id, 10) || 0;
    return an - bn;
  });

  return Response.json({ questions: sorted });
}
