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

  const [
    { data: scores },
    { data: wrongAnswers },
    { data: attendance },
    { data: memos },
    { data: coaching },
  ] = await Promise.all([
    supabase
      .from('test_scores')
      .select('*')
      .eq('student_id', id)
      .order('test_date'),
    supabase
      .from('wrong_answers')
      .select('*')
      .eq('student_id', id)
      .order('test_date', { ascending: false }),
    supabase
      .from('attendance')
      .select('*')
      .eq('student_id', id)
      .order('date'),
    supabase
      .from('student_memos')
      .select('*')
      .eq('student_id', id)
      .order('date', { ascending: false }),
    supabase
      .from('coaching_reports')
      .select('*')
      .eq('student_id', id)
      .order('test_date', { ascending: false })
      .limit(5),
  ]);

  return (
    <StudentDetailClient
      student={student}
      scores={scores || []}
      wrongAnswers={wrongAnswers || []}
      attendance={attendance || []}
      memos={memos || []}
      coachingReports={coaching || []}
    />
  );
}
