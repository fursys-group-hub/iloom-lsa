import { getSupabase } from '@/lib/supabase';
import ReportsPageClient from './ReportsPageClient';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const supabase = getSupabase();

  const [
    { data: batches },
    { data: students },
    { data: scores },
    { data: attendance },
    { data: notes },
    { data: memos },
    { data: examQuestions },
    { data: coachingReports },
  ] = await Promise.all([
    supabase.from('batches').select('*').order('start_date', { ascending: false }),
    supabase.from('students').select('*').order('name'),
    supabase.from('test_scores').select('*').order('test_date', { ascending: false }).limit(500),
    supabase.from('attendance').select('*'),
    supabase.from('student_notes').select('id, student_id, title, content, created_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('student_memos').select('student_id, category'),
    supabase.from('questions').select('id, batch_id, session, question_id, category'),
    supabase.from('coaching_reports').select('student_id, tag_tracking, created_at').order('created_at', { ascending: true }),
  ]);

  // test_responses 페이지네이션
  const allResponses: { student_id: string; batch_id: string; session: string; question_id: string; is_correct: boolean; test_date: string }[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data } = await supabase.from('test_responses')
      .select('student_id, batch_id, session, question_id, is_correct, test_date')
      .range(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    allResponses.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const { count: questionCount } = await supabase
    .from('student_questions')
    .select('*', { count: 'exact', head: true });

  return (
    <ReportsPageClient
      batches={batches || []}
      summaryProps={{
        batches: batches || [],
        students: students || [],
        scores: scores || [],
        attendance: attendance || [],
        notes: notes || [],
        memos: memos || [],
        testResponses: allResponses,
        examQuestions: examQuestions || [],
        coachingReports: coachingReports || [],
        totalQuestionCount: questionCount || 0,
      }}
    />
  );
}
