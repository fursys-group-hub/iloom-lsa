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

  // 설문 데이터
  const { data: surveysData } = await supabase.from('education_surveys').select('*').eq('student_id', id);

  // 반 전체 데이터 (평균 비교용)
  const { data: batchStudents } = await supabase.from('students').select('id').eq('batch_id', student.batch_id).eq('is_dropped', false);
  const batchStudentIds = (batchStudents || []).map(s => s.id);
  const [{ data: allAttendance }, { data: allNotes }] = await Promise.all([
    supabase.from('attendance').select('student_id, status').in('student_id', batchStudentIds),
    supabase.from('student_notes').select('student_id, content').in('student_id', batchStudentIds),
  ]);

  return (
    <StudentDetailClient
      student={student}
      batch={batch}
      scores={scores || []}
      allScores={allScores || []}
      attendance={attendance || []}
      allAttendance={allAttendance || []}
      allNotes={allNotes || []}
      memos={memos || []}
      coachingReports={coaching || []}
      responses={responses || []}
      questions={questions || []}
      notes={notes || []}
      surveys={surveysData || []}
    />
  );
}
