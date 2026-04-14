import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

/**
 * 학생 미니 스탯 API — 질문 페이지 등에서 가볍게 사용
 * GET /api/student-stats?studentId=xxx
 * 반환: { testAvg, attendanceRate, adaptationTotal, adaptationGroup }
 */
export async function GET(req: NextRequest) {
  try {
    const studentId = req.nextUrl.searchParams.get('studentId');
    if (!studentId) {
      return NextResponse.json({ error: 'studentId 필요' }, { status: 400 });
    }

    const supabase = createServerClient();

    // 학생 기본 정보 (batch_id 필요)
    const { data: student } = await supabase
      .from('students')
      .select('id, name, batch_id')
      .eq('id', studentId)
      .single();

    if (!student) {
      return NextResponse.json({ error: '학생 없음' }, { status: 404 });
    }

    // 기수 정보 (교육일수 계산)
    const { data: batch } = await supabase
      .from('batches')
      .select('start_date, end_date, schedule')
      .eq('id', student.batch_id)
      .single();

    // 시험 점수 + 출결 병렬 조회
    const [{ data: scores }, { data: attendance }] = await Promise.all([
      supabase.from('test_scores').select('score, test_date').eq('student_id', studentId),
      supabase.from('attendance').select('status, date').eq('student_id', studentId),
    ]);

    // 시험 평균 (직접 계산 — 타입 의존 없이)
    const testAvg = scores && scores.length > 0
      ? Math.round(scores.reduce((sum: number, s: { score: number }) => sum + s.score, 0) / scores.length * 10) / 10
      : null;

    // 출결률 계산
    let attendanceRate: number | null = null;
    if (attendance && attendance.length > 0) {
      // 교육일수: 스케줄에서 교육/실습일만 카운트
      let totalDays = 0;
      if (batch?.schedule && Array.isArray(batch.schedule)) {
        const today = new Date().toISOString().slice(0, 10);
        totalDays = batch.schedule.filter((d: { date: string; type: string }) =>
          d.type !== 'off' && d.date <= today
        ).length;
      }
      if (totalDays === 0) totalDays = attendance.length;

      let score = 0;
      for (const a of attendance) {
        if (a.status === 'present') score += 1;
        else if (a.status === 'late' || a.status === 'early_leave') score += 0.5;
      }
      attendanceRate = Math.min(100, Math.round((score / totalDays) * 100));
    }

    // 적응지수 — 이미 계산된 값이 있으면 사용, 없으면 간이 계산
    // students 테이블에 adaptation_index 컬럼이 없으므로 간이 계산
    let adaptationTotal: number | null = null;
    let adaptationGroup: string | null = null;
    if (testAvg !== null && attendanceRate !== null) {
      // 간이 적응지수: 시험(50%) + 출결(50%) — 정밀 계산은 상세 페이지에서
      adaptationTotal = Math.round(testAvg * 0.5 + attendanceRate * 0.5);
      adaptationGroup = adaptationTotal >= 70 ? 'high' : adaptationTotal >= 50 ? 'mid' : 'low';
    }

    return NextResponse.json({
      testAvg,
      attendanceRate,
      adaptationTotal,
      adaptationGroup,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
