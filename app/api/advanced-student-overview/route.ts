import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import type {
  AdvancedTestScore,
  WeekBlock,
  SessionSummary,
  AdvancedQuestion,
} from '@/lib/types';
import { computeAdvancedWeekSchedule, isWithinWeek } from '@/lib/advanced-week-schedule';

/**
 * GET /api/advanced-student-overview?student_id={id}
 *
 * 학생 대시보드용 통합 오버뷰:
 *   - 학생 본인의 주차/차시별 시험 기록 (기존 advanced-scores 와 동일 형태)
 *   - 같은 기수의 반 평균 (학생별 (주차,차시) 최고점의 평균)
 *   - (주차,차시)별 문제은행 전체 — 오답 문항 수 계산용
 */
export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get('student_id');
  if (!studentId) {
    return Response.json({ message: 'student_id가 필요합니다.' }, { status: 400 });
  }

  const supabase = createServerClient();

  // 1. 학생 → batch_id
  const { data: student } = await supabase
    .from('students')
    .select('id, batch_id')
    .eq('id', studentId)
    .single();
  if (!student) {
    return Response.json({ message: '학생을 찾을 수 없습니다.' }, { status: 404 });
  }
  const batchId = student.batch_id as string | null;

  // 2. pass_score + advanced_start
  let pass_score = 80;
  let advancedStart: string | null = null;
  if (batchId) {
    const { data: batch } = await supabase
      .from('batches')
      .select('advanced_pass_score, advanced_start')
      .eq('id', batchId)
      .single();
    if (batch) {
      if (typeof batch.advanced_pass_score === 'number') {
        pass_score = batch.advanced_pass_score;
      }
      advancedStart = (batch.advanced_start as string | null) ?? null;
    }
  }

  // 주차별 기한 (월~일, KST 기준)
  const weekSchedule = computeAdvancedWeekSchedule(advancedStart);

  // 3. 학생 본인 attempts (시간순)
  const { data: myRows } = await supabase
    .from('advanced_test_scores')
    .select('*')
    .eq('student_id', studentId)
    .order('submitted_at', { ascending: true });

  // 4. 기수 전체 attempts (반 평균 계산용)
  const { data: allRows } = batchId
    ? await supabase
        .from('advanced_test_scores')
        .select('student_id, week_number, sheet_attempt, score, submitted_at')
        .eq('batch_id', batchId)
    : { data: [] };

  // 5. 기수 전체 문제은행
  const { data: questionRows } = batchId
    ? await supabase
        .from('advanced_questions')
        .select('*')
        .eq('batch_id', batchId)
    : { data: [] };

  // 6. 학생 weeks 구조 계산 — 기한 밖 제출 제외
  const weeks: Record<number, WeekBlock> = {};
  for (const row of (myRows || []) as AdvancedTestScore[]) {
    const w = row.week_number;
    const s = row.sheet_attempt ?? 1;
    if (weekSchedule) {
      const range = weekSchedule[w];
      if (range && !isWithinWeek(row.submitted_at, range)) continue;
    }
    if (!weeks[w]) weeks[w] = { sessions: {} };
    if (!weeks[w].sessions[s]) {
      weeks[w].sessions[s] = {
        attempts: [],
        attempt_count: 0,
        passed: false,
        pass_attempt: null,
        final_score: null,
      };
    }
    weeks[w].sessions[s].attempts.push(row);
  }
  for (const wKey of Object.keys(weeks)) {
    const block = weeks[Number(wKey)];
    for (const sKey of Object.keys(block.sessions)) {
      const summary: SessionSummary = block.sessions[Number(sKey)];
      summary.attempt_count = summary.attempts.length;
      for (let i = 0; i < summary.attempts.length; i++) {
        if (summary.attempts[i].score >= pass_score) {
          summary.passed = true;
          summary.pass_attempt = i + 1;
          summary.final_score = summary.attempts[i].score;
          break;
        }
      }
      if (!summary.passed && summary.attempts.length > 0) {
        summary.final_score = summary.attempts[summary.attempts.length - 1].score;
      }
    }
  }

  // 7. 반 평균: (학생, 주차, 차시)별 최고점 → (주차, 차시)별 평균
  //    기한 밖 제출은 제외해야 공식 기록 기준 평균이 됨
  const bestByStudent = new Map<string, number>();
  for (const r of (allRows || []) as Array<{
    student_id: string;
    week_number: number;
    sheet_attempt: number | null;
    score: number;
    submitted_at: string;
  }>) {
    if (weekSchedule) {
      const range = weekSchedule[r.week_number];
      if (range && !isWithinWeek(r.submitted_at, range)) continue;
    }
    const key = `${r.student_id}|${r.week_number}|${r.sheet_attempt ?? 1}`;
    const prev = bestByStudent.get(key) ?? -1;
    if (r.score > prev) bestByStudent.set(key, r.score);
  }
  const classAgg = new Map<string, { sum: number; count: number }>();
  for (const [key, best] of bestByStudent) {
    const [, week, session] = key.split('|');
    const k = `${week}-${session}`;
    const agg = classAgg.get(k) || { sum: 0, count: 0 };
    agg.sum += best;
    agg.count++;
    classAgg.set(k, agg);
  }
  const class_avg: Record<string, { avg: number; count: number }> = {};
  for (const [k, { sum, count }] of classAgg) {
    class_avg[k] = {
      avg: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
      count,
    };
  }

  // 8. 문제은행 (주차, 차시)별 그룹핑
  const questions_by_key: Record<string, AdvancedQuestion[]> = {};
  for (const q of (questionRows || []) as AdvancedQuestion[]) {
    const k = `${q.week_number}-${q.session}`;
    if (!questions_by_key[k]) questions_by_key[k] = [];
    questions_by_key[k].push(q);
  }
  // 문제번호 숫자 정렬
  for (const k of Object.keys(questions_by_key)) {
    questions_by_key[k].sort((a, b) => {
      const an = parseInt(a.question_id, 10) || 0;
      const bn = parseInt(b.question_id, 10) || 0;
      return an - bn;
    });
  }

  return Response.json({
    pass_score,
    advanced_start: advancedStart,
    weeks,
    class_avg,
    questions_by_key,
  });
}
