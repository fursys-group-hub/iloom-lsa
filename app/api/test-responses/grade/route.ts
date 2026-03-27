import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// 개별 응답 채점 (서술형 수동 채점용)
export async function PATCH(req: NextRequest) {
  try {
    const { responses } = await req.json();
    // responses: [{ id, is_correct }]

    if (!responses || !Array.isArray(responses)) {
      return Response.json({ message: 'responses 배열이 필요합니다.' }, { status: 400 });
    }

    const supabase = createServerClient();
    const affectedStudentSessions = new Set<string>();
    let updated = 0;

    for (const r of responses) {
      const earnedScore = r.is_correct ? r.max_score : 0;

      await supabase
        .from('test_responses')
        .update({ is_correct: r.is_correct, earned_score: earnedScore })
        .eq('id', r.id);

      affectedStudentSessions.add(`${r.student_id}__${r.session}__${r.test_date}`);
      updated++;
    }

    // 영향받은 학생들 총점 재계산
    let scoresUpdated = 0;
    for (const key of affectedStudentSessions) {
      const [studentId, session, testDate] = key.split('__');

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
          { student_id: studentId, test_date: testDate, subject: session, score: score100, max_score: 100 },
          { onConflict: 'student_id,test_date,subject' }
        );
        scoresUpdated++;
      }
    }

    return Response.json({
      message: `채점 완료! ${updated}개 응답 처리, ${scoresUpdated}명 점수 업데이트`,
      updated,
      scoresUpdated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return Response.json({ message }, { status: 500 });
  }
}
