import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';

// ── GET: 특정 날짜의 실습일지 데이터 집계 (프롬프트 생성용) ──
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const batchId = searchParams.get('batchId');

  if (!date) return Response.json({ message: 'date 파라미터가 필요합니다.' }, { status: 400 });

  const supabase = getSupabase();

  // 1. 해당 날짜 보고서 존재 여부 확인
  let reportQuery = supabase
    .from('coaching_reports')
    .select('id, report_group_id, created_at, student_id')
    .eq('report_type', 'practice')
    .eq('test_date', date);

  if (batchId) {
    const { data: batchStudents } = await supabase
      .from('students')
      .select('id')
      .eq('batch_id', batchId)
      .eq('is_dropped', false);
    if (batchStudents && batchStudents.length > 0) {
      reportQuery = reportQuery.in('student_id', batchStudents.map(s => s.id));
    }
  }

  const { data: existingReports } = await reportQuery;
  const exists = existingReports && existingReports.length > 0;
  const groupId = exists ? existingReports[0].report_group_id : null;

  // 2. 해당 날짜 실습일지 데이터 가져오기
  const dateStart = `${date}T00:00:00+09:00`;
  const dateEnd = `${date}T23:59:59+09:00`;
  const utcStart = new Date(new Date(dateStart).getTime()).toISOString();
  const utcEnd = new Date(new Date(dateEnd).getTime()).toISOString();

  let studentIds: string[] | null = null;
  if (batchId) {
    const { data: students } = await supabase
      .from('students')
      .select('id')
      .eq('batch_id', batchId)
      .eq('is_dropped', false);
    if (students) studentIds = students.map(s => s.id);
  }

  let notesQuery = supabase
    .from('student_notes')
    .select('id, student_id, content, created_at, students(name, store_location)')
    .gte('created_at', utcStart)
    .lte('created_at', utcEnd)
    .order('created_at', { ascending: true });

  if (studentIds) notesQuery = notesQuery.in('student_id', studentIds);

  const { data: notes } = await notesQuery;

  // 실습일지 필터 + 집계
  interface StudentSummary {
    name: string;
    studentId: string;
    consult: number;
    estimate: number;
    order: number;
    amount: number;
    orderDetail: string;
    step1: string;
    step2: string;
    step3: string;
    step4: string;
  }

  const studentMap: Record<string, StudentSummary> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const note of (notes || []) as any[]) {
    try {
      const content = JSON.parse(note.content);
      const tags = content?.meta?.tags || [];
      if (!tags.includes('실습일지')) continue;

      const steps = content.steps || content;
      const name = note.students?.name || '알 수 없음';

      studentMap[note.student_id] = {
        name,
        studentId: note.student_id,
        consult: steps.stats_consult || 0,
        estimate: steps.stats_estimate || 0,
        order: steps.stats_order || 0,
        amount: steps.stats_amount || 0,
        orderDetail: steps.order_detail || '',
        step1: steps.step1 || '',
        step2: steps.step2 || '',
        step3: steps.step3 || '',
        step4: steps.step4 || '',
      };
    } catch { /* skip */ }
  }

  const students = Object.values(studentMap).sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  return Response.json({
    exists,
    groupId,
    reportCount: existingReports?.length || 0,
    practiceCount: students.length,
    students,
  });
}
