import { getSupabase } from '@/lib/supabase';
import AnalyticsClient from './AnalyticsClient';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const supabase = getSupabase();

  const [
    { data: batches },
    { data: students },
    { data: scores },
    { data: attendance },
    { data: notes },
    { data: testResponses },
    { data: questions },
    { data: studentQuestions },
    { data: memos },
    { data: coaching },
  ] = await Promise.all([
    supabase.from('batches').select('*').order('start_date', { ascending: false }),
    supabase.from('students').select('*').order('name'),
    supabase.from('test_scores').select('*').order('test_date'),
    supabase.from('attendance').select('*'),
    supabase.from('student_notes').select('id, student_id, title, content, created_at').order('created_at', { ascending: false }),
    // test_responses: Supabase 기본 limit 1000건 → 전체 가져오기
    (async () => {
      const all: { student_id: string; batch_id: string; session: string; question_id: string; is_correct: boolean; test_date: string }[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data } = await supabase.from('test_responses')
          .select('student_id, batch_id, session, question_id, is_correct, test_date')
          .range(from, from + pageSize - 1);
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return { data: all };
    })(),
    supabase.from('questions').select('id, batch_id, session, question_id, category, series, detail, question_text'),
    supabase.from('student_questions').select('id, student_id'),
    supabase.from('student_memos').select('student_id, category'),
    supabase.from('coaching_reports').select('student_id, tag_tracking'),
  ]);

  return (
    <AnalyticsClient
      batches={batches || []}
      students={students || []}
      scores={scores || []}
      attendance={attendance || []}
      notes={notes || []}
      testResponses={testResponses || []}
      questions={questions || []}
      studentQuestions={studentQuestions || []}
      memos={memos || []}
      coaching={coaching || []}
    />
  );
}
