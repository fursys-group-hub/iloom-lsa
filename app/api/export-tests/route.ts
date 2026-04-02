import { getSupabase } from '@/lib/supabase';
import { getKSTToday } from '@/lib/date';
import * as XLSX from 'xlsx';

export async function GET() {
  try {
    const supabase = getSupabase();

    // Supabase 기본 limit=1000이므로 페이지네이션으로 전체 가져오기
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchAll = async (table: string, order?: string): Promise<any[]> => {
      const PAGE = 1000;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let all: any[] = [];
      let from = 0;
      while (true) {
        let q = supabase.from(table).select('*').range(from, from + PAGE - 1);
        if (order) q = q.order(order);
        const { data } = await q;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return all;
    };

    const [students, scores, responses, questions] = await Promise.all([
      fetchAll('students', 'name'),
      fetchAll('test_scores'),
      fetchAll('test_responses', 'submitted_at'),
      fetchAll('questions'),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const studentMap = new Map(students.map((s: any) => [s.id, s]));

    // 차시 목록
    const sessions = [...new Set(responses.map((r: { session: string }) => r.session))].sort((a, b) => {
      const na = parseInt(String(a).replace(/[^0-9]/g, '')) || 0;
      const nb = parseInt(String(b).replace(/[^0-9]/g, '')) || 0;
      return na - nb;
    });

    const wb = XLSX.utils.book_new();

    // ══════ 시트 1: 결과_DB ══════
    const resultRows: unknown[][] = [
      ['일시', '차수', '이름', '점수', '총점', '100점 만점', '오답노트'],
    ];

    const groups = new Map<string, typeof responses>();
    for (const r of responses) {
      const key = `${r.student_id}__${r.session}__${r.test_date}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    for (const [, groupResp] of groups) {
      const first = groupResp[0];
      const student = studentMap.get(first.student_id);
      const score = scores.find(
        (s: { student_id: string; subject: string }) =>
          s.student_id === first.student_id && s.subject === first.session
      );

      const totalEarned = groupResp.reduce((s: number, r: { earned_score: number }) => s + (r.earned_score || 0), 0);
      const totalMax = groupResp.reduce((s: number, r: { max_score: number }) => s + (r.max_score || 0), 0);

      const wrongItems = groupResp
        .filter((r: { is_correct: boolean }) => !r.is_correct)
        .map((r: { question_id: string; session: string; user_answer: string }) => {
          const q = questions.find(
            (qq: { question_id: string; session: string }) =>
              qq.question_id === r.question_id && qq.session === r.session
          );
          const qNum = r.question_id.includes('-') ? 'Q' + r.question_id.split('-')[0] : 'Q' + r.question_id;
          let text = `${qNum}. ${q?.question_text || ''}\n  - 제출: ${r.user_answer || '입력 없음'}\n  - 정답: ${q?.correct_answer || ''}`;
          if (q?.explanation) text += `\n  - 해설: ${q.explanation}`;
          return text;
        });

      resultRows.push([
        first.submitted_at || first.test_date,
        first.session,
        student?.name || '',
        totalEarned,
        totalMax,
        score?.score ?? '',
        wrongItems.length > 0 ? wrongItems.join('\n\n') : '오답 없음 (Perfect!)',
      ]);
    }

    const resultWs = XLSX.utils.aoa_to_sheet(resultRows);
    resultWs['!cols'] = [
      { wch: 20 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 80 },
    ];
    XLSX.utils.book_append_sheet(wb, resultWs, '결과_DB');

    // ══════ 시트 2: 상세_로그 ══════
    const logRows: unknown[][] = [
      ['일시', '차수', '이름', '번호-소문항ID', '문제', '사용자가 작성한 답안', '정답', '정답 맞는지 확인', '가져간 배점 점수', '배점', '유형'],
    ];

    for (const r of responses) {
      const student = studentMap.get(r.student_id);
      const q = questions.find(
        (qq: { question_id: string; session: string }) =>
          qq.question_id === r.question_id && qq.session === r.session
      );
      logRows.push([
        r.submitted_at || r.test_date,
        r.session,
        student?.name || '',
        r.question_id,
        q?.question_text || '',
        r.user_answer || '',
        q?.correct_answer || '',
        r.is_correct ? 'O' : 'X',
        r.earned_score || 0,
        r.max_score || 0,
        r.scoring_mode || '',
      ]);
    }

    const logWs = XLSX.utils.aoa_to_sheet(logRows);
    logWs['!cols'] = [
      { wch: 20 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 50 }, { wch: 30 }, { wch: 30 }, { wch: 6 }, { wch: 8 }, { wch: 6 }, { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, logWs, '상세_로그');

    // ══════ 차시별 탭 ══════
    for (const session of sessions) {
      const sessionResp = responses.filter((r: { session: string }) => r.session === session);
      const sessionRows: unknown[][] = [
        ['순위', '이름', '제출시간', '점수(원점수)', '총점', '100점 환산', '정답수', '오답수'],
      ];

      const studentScores = new Map<string, { earned: number; max: number; correct: number; wrong: number; time: string }>();
      for (const r of sessionResp) {
        if (!studentScores.has(r.student_id)) {
          studentScores.set(r.student_id, { earned: 0, max: 0, correct: 0, wrong: 0, time: r.submitted_at || '' });
        }
        const s = studentScores.get(r.student_id)!;
        s.earned += r.earned_score || 0;
        s.max += r.max_score || 0;
        if (r.is_correct) s.correct++; else s.wrong++;
      }

      const sorted = [...studentScores.entries()]
        .map(([sid, stat]) => ({ sid, ...stat }))
        .sort((a, b) => {
          const rateA = a.max > 0 ? a.earned / a.max : 0;
          const rateB = b.max > 0 ? b.earned / b.max : 0;
          return rateB - rateA;
        });

      sorted.forEach((row, idx) => {
        const student = studentMap.get(row.sid);
        const score100 = row.max > 0 ? Math.round((row.earned / row.max) * 10000) / 100 : 0;
        const timePart = row.time.split(' ')[1] || '';
        sessionRows.push([
          idx + 1, student?.name || '', timePart, row.earned, row.max, score100, row.correct, row.wrong,
        ]);
      });

      const sessionWs = XLSX.utils.aoa_to_sheet(sessionRows);
      sessionWs['!cols'] = [
        { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 8 },
      ];
      XLSX.utils.book_append_sheet(wb, sessionWs, String(session));
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const today = getKSTToday();
    const fileName = `LSA_성적_${today}.xlsx`;

    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return Response.json({ message }, { status: 500 });
  }
}
