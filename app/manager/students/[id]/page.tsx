import { getSupabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import StudentDetailClient from '@/app/dashboard/students/[id]/StudentDetailClient';
import ManagerStudentTabs from '../ManagerStudentTabs';

export const dynamic = 'force-dynamic';

export default async function ManagerStudentDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = getSupabase();

  const { data: student } = await supabase
    .from('students')
    .select('*')
    .eq('id', id)
    .single();

  if (!student) notFound();

  const { data: batch } = await supabase.from('batches').select('*').eq('id', student.batch_id).single();

  const [
    { data: scores },
    { data: allScores },
    { data: attendance },
    { data: coaching },
    { data: responses },
    { data: questions },
    { data: notes },
  ] = await Promise.all([
    supabase.from('test_scores').select('*').eq('student_id', id).order('test_date'),
    supabase.from('test_scores').select('*'),
    supabase.from('attendance').select('*').eq('student_id', id).order('date'),
    supabase.from('coaching_reports').select('*').eq('student_id', id).order('test_date', { ascending: false }).limit(5),
    supabase.from('test_responses').select('*').eq('student_id', id).order('session,question_id'),
    supabase.from('questions').select('*'),
    supabase.from('student_notes').select('id, student_id, content, created_at').eq('student_id', id),
  ]);

  const { data: surveysData } = await supabase.from('education_surveys').select('*').eq('student_id', id);
  const { data: ansanSurveysData } = await supabase.from('ansan_tour_surveys').select('*').eq('student_id', id).order('phase');

  const { data: batchStudents } = await supabase.from('students').select('id').eq('batch_id', student.batch_id).eq('is_dropped', false);
  const batchStudentIds = (batchStudents || []).map((s: { id: string }) => s.id);
  const [{ data: allAttendance }, { data: allNotes }] = await Promise.all([
    supabase.from('attendance').select('student_id, status').in('student_id', batchStudentIds),
    supabase.from('student_notes').select('student_id, content').in('student_id', batchStudentIds),
  ]);

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 20px', letterSpacing: '-0.025em' }}>입문교육 기록 확인</h1>
        <ManagerStudentTabs currentId={id} />
      </div>
      <StudentDetailClient
        student={student}
        batch={batch}
        scores={scores || []}
        allScores={allScores || []}
        attendance={attendance || []}
        allAttendance={allAttendance || []}
        allNotes={allNotes || []}
        memos={[]}
        coachingReports={coaching || []}
        responses={responses || []}
        questions={questions || []}
        notes={notes || []}
        surveys={surveysData || []}
        ansanSurveys={ansanSurveysData || []}
        hideMemos={true}
      />
    </div>
  );
}
