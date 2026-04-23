import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import type { AdvancedTestScore, WeekBlock, SessionSummary } from '@/lib/types';
import { computeAdvancedWeekSchedule, isWithinWeek } from '@/lib/advanced-week-schedule';

/**
 * GET /api/advanced-scores?student_id={id}
 *
 * 학생의 모든 심화 시험 제출 기록을 조회하고
 * (주차, 차시) 조합별로 그룹핑 + 통과여부를 계산해 반환한다.
 *
 * 예) 1주차 1차시 시험 vs 1주차 2차시 시험은 별도 시험이므로 각각 집계.
 */
export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get('student_id');
  if (!studentId) {
    return Response.json({ message: 'student_id가 필요합니다.' }, { status: 400 });
  }

  const supabase = createServerClient();

  // 1. 학생 → batch → pass_score
  const { data: student } = await supabase
    .from('students')
    .select('id, batch_id')
    .eq('id', studentId)
    .single();
  if (!student) {
    return Response.json({ message: '학생을 찾을 수 없습니다.' }, { status: 404 });
  }

  let pass_score = 80;
  let advancedStart: string | null = null;
  if (student.batch_id) {
    const { data: batch } = await supabase
      .from('batches')
      .select('advanced_pass_score, advanced_start')
      .eq('id', student.batch_id)
      .single();
    if (batch) {
      if (typeof batch.advanced_pass_score === 'number') {
        pass_score = batch.advanced_pass_score;
      }
      advancedStart = (batch.advanced_start as string | null) ?? null;
    }
  }

  // 주차별 응시 기한 (advanced_start 기반, 월~일 7일 단위 KST)
  const weekSchedule = computeAdvancedWeekSchedule(advancedStart);

  // 2. 제출 기록 조회 (submitted_at 오름차순)
  const { data: rows, error } = await supabase
    .from('advanced_test_scores')
    .select('*')
    .eq('student_id', studentId)
    .order('submitted_at', { ascending: true });
  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  // 3. (주차, 차시) 그룹핑 — 기한 밖 제출은 제외 (자기 공부용)
  const weeks: Record<number, WeekBlock> = {};
  for (const row of (rows || []) as AdvancedTestScore[]) {
    const w = row.week_number;
    const s = row.sheet_attempt ?? 1;

    // 기한 필터: advanced_start가 설정되어 있고, 해당 주차 범위가 있고, 제출이 범위 밖이면 스킵
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

  // 4. 각 (주차, 차시)별 통과 계산
  for (const wKey of Object.keys(weeks)) {
    const wn = Number(wKey);
    const block = weeks[wn];
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

  return Response.json({ pass_score, weeks });
}
