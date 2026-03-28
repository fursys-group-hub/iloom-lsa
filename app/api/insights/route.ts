import { NextRequest } from 'next/server';
import { createServerClient, getSupabase } from '@/lib/supabase';

// 저장된 인사이트 조회
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const batchId = searchParams.get('batchId');

  const supabase = getSupabase();
  let query = supabase.from('teaching_insights').select('*').order('created_at', { ascending: false });
  if (batchId) query = query.eq('batch_id', batchId);

  const { data, error } = await query.limit(10);
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ insights: data });
}

// AI 분석 생성
export async function POST(req: NextRequest) {
  try {
    const { batchId, session } = await req.json();
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      return Response.json({ message: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }

    const supabase = createServerClient();

    // 1. 데이터 수집
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchAll = async (table: string, filter?: Record<string, string>): Promise<any[]> => {
      let q = supabase.from(table).select('*');
      if (filter) {
        for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
      }
      const { data } = await q.limit(5000);
      return data || [];
    };

    const [responses, questions] = await Promise.all([
      fetchAll('test_responses', session ? { session } : undefined),
      fetchAll('questions'),
    ]);

    if (responses.length === 0) {
      return Response.json({ message: '분석할 응답 데이터가 없어요.' }, { status: 400 });
    }

    // 2. 오답 통계 계산
    const stats: Record<string, { correct: number; total: number }> = {};
    for (const r of responses) {
      const k = `${r.session}|${r.question_id}`;
      if (!stats[k]) stats[k] = { correct: 0, total: 0 };
      stats[k].total++;
      if (r.is_correct) stats[k].correct++;
    }

    // 정답률 낮은 순 (5명 이상 응시)
    const worstItems = Object.entries(stats)
      .filter(([, v]) => v.total >= 3)
      .map(([k, v]) => ({ key: k, rate: Math.round((v.correct / v.total) * 100), ...v }))
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 12);

    // 문항 상세 연결
    const worstDetails = worstItems.map((w) => {
      const [sess, qid] = w.key.split('|');
      const q = questions.find(
        (qq: { session: string; question_id: string }) => qq.session === sess && qq.question_id === qid
      );
      return {
        session: sess,
        questionId: qid,
        rate: w.rate,
        correct: w.correct,
        total: w.total,
        question: q?.question_text || '',
        answer: q?.correct_answer || '',
        category: q?.category || '',
        series: q?.series || '',
        detail: q?.detail || '',
        scoringMode: q?.scoring_mode || '',
        explanation: q?.explanation || '',
      };
    });

    // 3. Gemini 프롬프트 구성
    const prompt = buildPrompt(worstDetails, session);

    // 4. Gemini API 호출
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4000,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      return Response.json({ message: `Gemini API 오류: ${err}` }, { status: 500 });
    }

    const geminiData = await geminiRes.json();
    const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '분석 결과를 생성하지 못했어요.';

    // 5. DB 저장
    await supabase.from('teaching_insights').insert({
      batch_id: batchId || null,
      session: session || '전체',
      content,
    });

    return Response.json({ content, message: '교육 인사이트가 생성되었어요!' });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return Response.json({ message: `분석 실패: ${message}` }, { status: 500 });
  }
}

interface WorstDetail {
  session: string;
  questionId: string;
  rate: number;
  correct: number;
  total: number;
  question: string;
  answer: string;
  category: string;
  series: string;
  detail: string;
  scoringMode: string;
  explanation: string;
}

function buildPrompt(worstDetails: WorstDetail[], session?: string): string {
  const questionList = worstDetails
    .map((w) =>
      `- [${w.session} Q${w.questionId}] 정답률 ${w.rate}% (${w.correct}/${w.total}명)
  카테고리: ${w.category} > ${w.series} > ${w.detail}
  문제: ${w.question}
  정답: ${w.answer}
  채점방식: ${w.scoringMode}
  해설: ${w.explanation}`
    )
    .join('\n\n');

  return `당신은 일룸(iloom) 가구 교육 분석 시스템입니다.
일룸의 가구 소재(LPM, HPM, PP, 무늬목, 엣지), 제품 시리즈(팅클팝, 로이, 뉴트, 멘디, 링키플러스 등), 색상 코드, 규격, 시공/설치에 대한 전문 지식을 보유하고 있습니다.

아래는 교육생들이 가장 많이 틀린 문항 데이터입니다${session ? ` (${session} 기준)` : ' (전체 차시)'}:

${questionList}

위 데이터를 분석해서 아래 형식 그대로 출력하세요. 인사말이나 위로 메시지 없이 바로 시작하세요.

📊 교육 추천 리포트${session ? ` (${session})` : ' (전체 차시)'}

🚨 가장 취약한 3개 영역

각 영역마다 이 형식으로:
**N. [영역명] — 평균 정답률 N%**
- 관련 문항 요약 (몇 개가 오답 TOP에 포함, 어떤 내용)
- 왜 틀리는지 원인 (용어 혼동, 암기 부족, 문제 난이도 등)
- 교육 추천: 구체적 교육 방법 (실물 샘플, 비교표, 구호, 퀴즈 등)
- 변형 문제 제안: 실제 출제 가능한 문제 1~2개 (정답 포함)

⚠️ 추가 주의 영역 (2~3개)
- 각 항목: 영역명 (정답률%) — 한줄 원인 + 한줄 교육 팁

💡 전체 코멘트
- 다음 시험 전까지 꼭 짚어야 할 포인트 1~2줄

규칙:
- 한국어로 작성
- 변형 문제는 실제로 출제 가능한 형태로 (채점모드, 정답 명시)
- 간결하고 실용적으로. 불필요한 인사말/위로/마무리 인사 금지
- 데이터에 기반한 분석만. 추측 금지
`;
}
