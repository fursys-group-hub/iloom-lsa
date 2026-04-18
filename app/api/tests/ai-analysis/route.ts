import { NextRequest } from 'next/server';

interface WrongOption { answer: string; count: number; label: string }

interface AnalysisPayload {
  questionText: string;
  correctAnswer: string;
  options: string;
  category: string;
  detail: string;
  total: number;
  correct: number;
  wrong: number;
  wrongRate: number;
  topWrong: WrongOption[];
}

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return Response.json({ message: 'GEMINI_API_KEY가 설정되지 않았어요.' }, { status: 500 });

    const body = (await req.json()) as AnalysisPayload;
    const { questionText, correctAnswer, options, category, detail, total, correct, wrong, wrongRate, topWrong } = body;

    const optText = options?.trim() ? options.split('\n').map(s => s.trim()).filter(Boolean).join('\n') : '(보기 없음)';
    const wrongBreakdown = topWrong.length
      ? topWrong.map(w => `- "${w.answer}"${w.label ? ` (${w.label})` : ''}: ${w.count}명 (오답 중 ${wrong > 0 ? Math.round((w.count / wrong) * 100) : 0}%)`).join('\n')
      : '(오답 선지 데이터 없음)';

    const prompt = `당신은 일룸(iloom)이라는 한국 가구 브랜드의 영업 교육 담당자를 돕는 분석가입니다.
아래 시험 문항에서 교육생들이 많이 틀린 이유를 추정하고, 다음 교육에서 어떻게 보강하면 좋을지 짧고 실행 가능한 제안을 해주세요.

## 문항 정보
- 카테고리: ${category || '(미분류)'} / ${detail || '(미분류)'}
- 문제: ${questionText || '(본문 없음)'}
- 보기:
${optText}
- 정답: ${correctAnswer || '(기재 없음)'}

## 응시 결과
- 총 ${total}명 응시 (정답 ${correct}명 / 오답 ${wrong}명, 오답률 ${wrongRate}%)

## 오답 선지 분포 (많이 고른 순)
${wrongBreakdown}

## 요청사항
다음 섹션을 한국어로 **간결하게** 작성해주세요. 각 섹션 2~3문장. 불릿포인트 사용.
섹션 제목은 반드시 \`###\` + 이모지 + 제목 형태로.

### 🔎 왜 이 문항을 많이 틀렸을까
(오답 선지 분포에 근거하여, 교육생들이 어떤 개념을 오해하고 있는지 추정. "아마도" 같은 추측 표현 사용해도 좋음)

### ⚠️ 문항 자체 점검
(문제가 모호하거나 보기가 헷갈리게 설계되었을 가능성을 점검. 문제 없으면 "문항 설계는 명확해 보입니다"라고 써도 OK)

### 💡 교육 보강 제안
(다음 교육에서 어떤 포인트를 강조하면 이 오해를 풀 수 있을지 2~3개 액션)

### ✏️ 이렇게 출제했다면 (선택)
**이 섹션은 "문항 자체 점검"에서 문항 설계에 문제가 있다고 판단한 경우에만 작성하세요. 문항 설계가 명확하다면 이 섹션 전체를 생략하세요.**
문항을 어떻게 바꾸면 더 명확하고 학습 효과가 높아질지 **구체적인 문제/보기/정답**까지 예시로 제시하세요.
예시 포맷:
> **문제:** ...
> **보기:**
> 1) ...
> 2) ...
> 3) ...
> 4) ...
> **정답:** 2
> **개선 포인트:** (바꾼 이유 한 줄)

주의: 마크다운만 사용. HTML 금지. 한국어 존댓말.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2048,
            // Gemini 2.5 Flash는 기본적으로 thinking을 켜서 출력 토큰을 잡아먹음 → 비활성화
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      return Response.json({ message: `Gemini 호출 실패: ${err.slice(0, 200)}` }, { status: 500 });
    }
    const geminiData = await geminiRes.json();
    const candidate = geminiData?.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    // 모든 text 파트 이어붙이기 (Gemini가 여러 파트로 쪼개 보낼 수 있음)
    const text = parts.map((p: { text?: string }) => p?.text || '').join('').trim();
    const finishReason = candidate?.finishReason || '';

    if (!text) {
      return Response.json({ message: `AI 응답이 비어있어요. (finishReason: ${finishReason || 'unknown'})` }, { status: 500 });
    }

    return Response.json({ text, finishReason });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '알 수 없는 오류';
    return Response.json({ message: msg }, { status: 500 });
  }
}
