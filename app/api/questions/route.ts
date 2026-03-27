import { NextRequest } from 'next/server';
import { createServerClient, getSupabase } from '@/lib/supabase';

// 문제 목록 조회
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const batchId = searchParams.get('batchId');
  const session = searchParams.get('session');

  const supabase = getSupabase();
  let query = supabase.from('questions').select('*');

  if (batchId) query = query.eq('batch_id', batchId);
  if (session) query = query.eq('session', session);

  const { data, error } = await query.order('session').order('question_id');
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ questions: data });
}

// 정답 수정 + 재채점
export async function PATCH(req: NextRequest) {
  try {
    const { questionId: id, correct_answer, scoring_mode, max_score } = await req.json();

    if (!id) {
      return Response.json({ message: 'questionId가 필요합니다.' }, { status: 400 });
    }

    const supabase = createServerClient();

    // 1. 문제 업데이트 (정답 + 채점모드 + 배점)
    const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (correct_answer !== undefined) updateFields.correct_answer = correct_answer;
    if (scoring_mode !== undefined) updateFields.scoring_mode = scoring_mode;
    if (max_score !== undefined) updateFields.max_score = max_score;

    const { data: question, error: qError } = await supabase
      .from('questions')
      .update(updateFields)
      .eq('id', id)
      .select('*')
      .single();

    if (qError || !question) {
      return Response.json({ message: '문제를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 2. 해당 문제의 모든 학생 응답 가져오기
    const { data: responses } = await supabase
      .from('test_responses')
      .select('*')
      .eq('session', question.session)
      .eq('question_id', question.question_id)
      .eq('batch_id', question.batch_id);

    if (!responses || responses.length === 0) {
      return Response.json({
        message: '정답이 수정되었어요. (해당 응답 데이터 없음)',
        regraded: 0,
      });
    }

    // 3. 각 응답 재채점 (업데이트된 question 기준)
    const finalAnswer = question.correct_answer;
    const newAnswers = finalAnswer.split('|').map((a: string) => a.trim().toLowerCase());
    let regraded = 0;
    const affectedStudentSessions = new Set<string>();

    for (const resp of responses) {
      const userAnswers = (resp.user_answer || '')
        .split(',')
        .map((a: string) => a.trim().toLowerCase());

      let isCorrect = false;
      const mode = resp.scoring_mode || question.scoring_mode || '';

      if (mode === 'OX') {
        isCorrect = userAnswers[0] === newAnswers[0];
      } else if (mode.includes('객관식_단일') || mode.includes('주관식_단답')) {
        isCorrect = newAnswers.some((a: string) => userAnswers.includes(a));
      } else if (mode.includes('순서무관') || mode.includes('객관식_복수')) {
        const sorted1 = [...userAnswers].sort();
        const sorted2 = [...newAnswers].sort();
        isCorrect = sorted1.length === sorted2.length &&
          sorted1.every((v, i) => v === sorted2[i]);
      } else if (mode.includes('순위차등')) {
        // 순위차등: 각 위치별 부분점수 → 전부 맞으면 O
        isCorrect = newAnswers.length === userAnswers.length &&
          newAnswers.every((a: string, i: number) => a === userAnswers[i]);
      } else if (mode.includes('서술')) {
        // 서술형은 자동 재채점 불가, 기존 유지
        continue;
      } else {
        isCorrect = newAnswers.some((a: string) => userAnswers.includes(a));
      }

      const newMaxScore = question.max_score;
      const earnedScore = isCorrect ? newMaxScore : 0;

      await supabase
        .from('test_responses')
        .update({ is_correct: isCorrect, earned_score: earnedScore, max_score: newMaxScore })
        .eq('id', resp.id);

      affectedStudentSessions.add(`${resp.student_id}__${resp.session}__${resp.test_date}`);
      regraded++;
    }

    // 4. 영향받은 학생들의 총점 재계산
    let scoresUpdated = 0;
    for (const key of affectedStudentSessions) {
      const [studentId, session, testDate] = key.split('__');

      // 해당 학생의 해당 차시 전체 응답에서 점수 합산
      const { data: allResp } = await supabase
        .from('test_responses')
        .select('earned_score, max_score')
        .eq('student_id', studentId)
        .eq('session', session)
        .eq('test_date', testDate);

      if (allResp && allResp.length > 0) {
        const totalEarned = allResp.reduce((s, r) => s + (r.earned_score || 0), 0);
        const totalMax = allResp.reduce((s, r) => s + (r.max_score || 0), 0);
        const score100 = totalMax > 0 ? Math.round((totalEarned / totalMax) * 10000) / 100 : 0;

        await supabase.from('test_scores').upsert(
          {
            student_id: studentId,
            test_date: testDate,
            subject: session,
            score: score100,
            max_score: 100,
          },
          { onConflict: 'student_id,test_date,subject' }
        );
        scoresUpdated++;
      }
    }

    return Response.json({
      message: `정답 수정 완료! ${regraded}개 응답 재채점, ${scoresUpdated}명 점수 업데이트`,
      regraded,
      scoresUpdated,
      newAnswer: correct_answer,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return Response.json({ message: `재채점 실패: ${message}` }, { status: 500 });
  }
}
