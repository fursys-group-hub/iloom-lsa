import { getSupabase } from '@/lib/supabase';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = getSupabase();

  const [
    { data: batches },
    { data: students },
    { data: scores },
    { data: attendance },
    { data: notes },
    { data: announcements },
    { data: noteComments },
    { data: questions },
    { data: memos },
    { data: testResponses },
    { data: examQuestions },
    { data: coachingReports },
  ] = await Promise.all([
    supabase.from('batches').select('*').order('start_date', { ascending: false }),
    supabase.from('students').select('*').order('name'),
    supabase.from('test_scores').select('*').order('test_date', { ascending: false }).limit(500),
    supabase.from('attendance').select('*'),
    supabase.from('student_notes').select('id, student_id, title, content, created_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(5),
    supabase.from('note_comments').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('student_questions').select('*, students(name)').order('updated_at', { ascending: false }).limit(20),
    supabase.from('student_memos').select('student_id, category'),
    // 🆕 주의 교육생 판정에 필요한 데이터 (교육생 종합 분석과 동일 로직)
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
    supabase.from('questions').select('id, batch_id, session, question_id, category'),
    supabase.from('coaching_reports').select('student_id, tag_tracking, created_at').order('created_at', { ascending: true }),
  ]);

  // 학생별 메모 수
  const memoCounts: Record<string, number> = {};
  for (const m of (memos || [])) {
    memoCounts[m.student_id] = (memoCounts[m.student_id] || 0) + 1;
  }

  const questionsWithName = (questions || []).map((q: Record<string, unknown>) => ({
    id: q.id as string,
    student_id: q.student_id as string,
    title: q.title as string,
    status: q.status as 'open' | 'answered',
    created_at: q.created_at as string,
    updated_at: q.updated_at as string,
    student_name: ((q.students as Record<string, unknown>)?.name as string) || '알 수 없음',
  }));

  return (
    <DashboardClient
      batches={batches || []}
      students={students || []}
      scores={scores || []}
      attendance={attendance || []}
      notes={notes || []}
      announcements={announcements || []}
      noteComments={noteComments || []}
      questions={questionsWithName}
      memoCounts={memoCounts}
      memos={memos || []}
      testResponses={testResponses || []}
      examQuestions={examQuestions || []}
      coachingReports={coachingReports || []}
    />
  );
}
