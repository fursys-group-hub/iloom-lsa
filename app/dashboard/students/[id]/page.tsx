import { getSupabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import StudentDetailClient from './StudentDetailClient';

export const dynamic = 'force-dynamic';

export default async function StudentDetailPage(props: PageProps<'/dashboard/students/[id]'>) {
  const { id } = await props.params;
  const supabase = getSupabase();

  const { data: student } = await supabase
    .from('students')
    .select('*')
    .eq('id', id)
    .single();

  if (!student) notFound();

  // 기수 정보 (교육일수 계산용)
  const { data: batch } = await supabase.from('batches').select('*').eq('id', student.batch_id).single();

  const [
    { data: scores },
    { data: allScores },
    { data: attendance },
    { data: memos },
    { data: coaching },
    { data: responses },
    { data: questions },
    { data: notes },
  ] = await Promise.all([
    supabase.from('test_scores').select('*').eq('student_id', id).order('test_date'),
    supabase.from('test_scores').select('*'),
    supabase.from('attendance').select('*').eq('student_id', id).order('date'),
    supabase.from('student_memos').select('*').eq('student_id', id).order('date', { ascending: false }),
    supabase.from('coaching_reports').select('*').eq('student_id', id).order('test_date', { ascending: false }).limit(5),
    supabase.from('test_responses').select('*').eq('student_id', id).order('session,question_id'),
    supabase.from('questions').select('*'),
    supabase.from('student_notes').select('id, student_id, content, created_at').eq('student_id', id),
  ]);

  return (
    <StudentDetailClient
      student={student}
      batch={batch}
      scores={scores || []}
      allScores={allScores || []}
      attendance={attendance || []}
      memos={memos || []}
      coachingReports={coaching || []}
      responses={responses || []}
      questions={questions || []}
      notes={notes || []}
    />
  );
}
