/**
 * Gemini 프롬프트 빌더 — 시리즈 분류 + 챕터 초안 작성
 */

import { SERIES_LIST, getCategoryBySeriesName } from './series-map';

export interface NoteForClassify {
  id: string;
  student_name?: string;
  step1?: string;
  step2?: string;
  step3?: string;
  tags?: string[];
}

/**
 * 분류 프롬프트: 노트 배치를 받아서 시리즈 태그 부여
 */
export function buildClassifyPrompt(notes: NoteForClassify[]): string {
  const seriesByCategory: Record<string, string[]> = {
    '키즈': [], '서재': [], '침실': [], '스터디': [], '리빙': [], '다이닝': [],
  };
  for (const s of SERIES_LIST) {
    const cat = getCategoryBySeriesName(s);
    if (seriesByCategory[cat]) seriesByCategory[cat].push(s);
  }

  const seriesCatalog = Object.entries(seriesByCategory)
    .map(([cat, list]) => `- ${cat}: ${list.join(', ')}`)
    .join('\n');

  const notesJson = notes
    .map((n) => ({
      id: n.id,
      step1: (n.step1 || '').slice(0, 800),
      step2: (n.step2 || '').slice(0, 800),
      step3: (n.step3 || '').slice(0, 600),
      tags: n.tags || [],
    }));

  return `당신은 일룸 가구 영업 교육생들의 학습일지를 분류하는 전문가입니다.
아래 노트 각각이 어떤 일룸 제품 시리즈에 관한 것인지 분류해주세요.

# 일룸 제품 시리즈 카탈로그 (대분류별)
${seriesCatalog}

# 분류 규칙
1. 노트 본문에 **명시적으로 언급된** 시리즈만 태깅. 추측하지 말 것
2. 한 노트가 여러 시리즈를 다루면 모두 포함 (예: "뉴트와 로이 비교" → ["뉴트", "로이"])
3. 시리즈가 전혀 명시되지 않은 일반 내용(회사 소개, 영업 스킬 등)은 빈 배열 \`[]\`
4. confidence: 0.0~1.0 (명시 정도에 따라). 0.6 미만이면 약한 매칭

# 노트 데이터
${JSON.stringify(notesJson, null, 2)}

# 출력 형식 (반드시 JSON 배열, 다른 텍스트 없이)
\`\`\`json
[
  { "note_id": "uuid", "series": ["뉴트", "로이"], "confidence": 0.92 },
  { "note_id": "uuid", "series": [], "confidence": 0 }
]
\`\`\`

JSON만 출력하세요.`;
}

export interface NoteForDraft {
  id: string;
  student_name: string;
  batch_label?: string;     // 예: "P5"
  date_label?: string;      // 예: "4/12"
  is_self_study: boolean;
  step1?: string;
  step2?: string;
  step3?: string;
}

export interface PptxSeed {
  file_name: string;
  full_text: string;
}

/**
 * PPT 전체 텍스트에서 특정 시리즈가 언급된 슬라이드만 추출
 * - "--- Slide N: title ---" 단위로 분할 후 시리즈명 포함된 슬라이드만 모음
 * - 매칭된 슬라이드 + 그 직전/직후 슬라이드까지 함께 (문맥 보존)
 */
export function extractSeriesSlides(fullText: string, seriesName: string): string {
  if (!fullText || !seriesName) return '';
  const slides = fullText.split(/(?=--- Slide \d+)/g).filter(Boolean);
  const matchedIdx = new Set<number>();
  for (let i = 0; i < slides.length; i++) {
    if (slides[i].includes(seriesName)) {
      matchedIdx.add(i);
      if (i > 0) matchedIdx.add(i - 1);  // 직전 슬라이드 (목차/카테고리 헤더 보존)
      if (i + 1 < slides.length) matchedIdx.add(i + 1); // 직후 슬라이드 (이어지는 사양)
    }
  }
  if (matchedIdx.size === 0) return '';
  return Array.from(matchedIdx).sort((a, b) => a - b).map((i) => slides[i]).join('\n');
}

/**
 * 챕터 초안 작성 프롬프트 (사양표 + 단종/사양변경 + 매장 팁 구조)
 *
 * 핵심 출력 구조:
 * 1. 사진 placeholder (수동 첨부용 자리)
 * 2. 기본 정보 표 (카테고리, 컨셉, 차별점)
 * 3. 운영 라인업 표
 * 4. 마감재/색상 옵션 표
 * 5. 소재/내장재 표
 * 6. 제품 특장점 (불릿)
 * 7. 단종/사양변경 알림 (일지에서 발견 시)
 * 8. 매장 실전 팁 (일지)
 * 9. 학생 깨달음 사례 (일지 인용)
 */
export function buildDraftPrompt(seriesName: string, notes: NoteForDraft[], seeds: PptxSeed[]): string {
  const category = getCategoryBySeriesName(seriesName);

  const educationNotes = notes.filter((n) => !n.is_self_study);
  const selfStudyNotes = notes.filter((n) => n.is_self_study);

  const formatNote = (n: NoteForDraft) => `
[ID:${n.id}] ${n.student_name} (${n.batch_label || '?'} · ${n.date_label || '?'})
- STEP 1: ${(n.step1 || '').trim()}
- STEP 2: ${(n.step2 || '').trim()}
- STEP 3: ${(n.step3 || '').trim()}
`.trim();

  // 시리즈명 포함된 슬라이드만 추출 → 토큰 절약 + 정확도 향상
  const seedTexts = seeds
    .map((s) => {
      const filtered = extractSeriesSlides(s.full_text, seriesName);
      return filtered ? `## 📄 ${s.file_name} (관련 슬라이드만)\n${filtered}` : null;
    })
    .filter(Boolean);

  const seedsBlock = seedTexts.length > 0
    ? seedTexts.join('\n\n---\n\n')
    : '⚠️ 기존 PPT 자료에 이 시리즈가 명시적으로 언급되지 않음. 일지 정보만으로 작성.';

  return `당신은 일룸 가구 영업 신입사원용 **교재 챕터**를 작성하는 교육 전문가입니다.
"${seriesName}" 시리즈(${category} 카테고리) 한 챕터를 다음 규칙에 따라 작성하세요.

# 핵심 원칙
1. **사양 정보는 반드시 표(table)로 정리** — 줄글 금지, 매장에서 바로 참조 가능해야 함
2. **PPT + 일지 모두 검토해서 표 채우기** — PPT 자료가 오래되어 일지에 최신 정보가 있을 수 있음. 두 소스를 모두 검토해서 가장 정확한 정보로 표 채울 것
3. **PPT와 일지 사이에 차이점 발견 시 명시**:
   - 일지에만 있는 새 항목: \`<strong>NEW:</strong>\` 표시 + \`<cite>학생명, 기수·날짜</cite>\` 출처
   - PPT와 일지가 다른 경우: 셀에 두 정보 모두 적되 일지 쪽에 출처 표기 (예: "PPT: A / 일지: B <cite>...</cite>")
   - 완전 단종된 항목: \`<del>\` 태그 + 단종 알림 섹션에도 기록
4. **사진 자리는 placeholder**로 표시 (\`<div class="photo-placeholder">[대표 사진]</div>\`)
5. 일지 인용 시 \`<cite>학생명, 기수·날짜</cite>\` 형태로 출처 표기
6. 정보가 부족한 칸은 비워두지 말고 "(자료 부족)" 으로 명시
7. **모든 표(라인업/마감재/소재)에서 일지를 함께 검토해야 함** — 단종/사양변경 알림 섹션만 일지 기반이 아님

# 출력 형식 (HTML) — 반드시 이 구조 그대로
\`\`\`html
<section class="basic-info">
  <h2>📋 기본 정보</h2>
  <div class="photo-placeholder">[대표 사진]</div>
  <table>
    <tr><th>카테고리</th><td>...</td></tr>
    <tr><th>컨셉</th><td>...</td></tr>
    <tr><th>차별 포인트</th><td>...</td></tr>
    <tr><th>타겟 고객</th><td>...</td></tr>
  </table>
</section>

<section class="lineup">
  <h2>🪑 운영 라인업</h2>
  <p class="source-note">PPT 자료 + 학생 일지 모두 검토. 일지에서 추가/변경된 항목은 <strong>NEW</strong> 또는 출처 표기.</p>
  <table>
    <thead><tr><th>라인업</th><th>특징/사이즈</th><th>비고</th></tr></thead>
    <tbody>
      <tr><td>1인용</td><td>...</td><td>...</td></tr>
      <tr><td>2.5인용</td><td>...</td><td>...</td></tr>
      <!-- 일지에만 있는 항목 예시 -->
      <!-- <tr><td><strong>NEW:</strong> 4인용</td><td>...</td><td>2026년 추가 <cite>학생명, 기수·날짜</cite></td></tr> -->
    </tbody>
  </table>
</section>

<section class="finishes">
  <h2>🎨 마감재 / 색상 옵션</h2>
  <p class="source-note">PPT + 일지 통합. 일지에 새로 등장한 옵션이나 단종된 옵션은 표시.</p>
  <table>
    <thead><tr><th>옵션명</th><th>특징</th><th>출처/비고</th></tr></thead>
    <tbody>
      <tr><td>...</td><td>...</td><td>...</td></tr>
    </tbody>
  </table>
</section>

<section class="materials">
  <h2>🔧 소재 / 내장재</h2>
  <p class="source-note">PPT + 일지 비교. 변경된 소재가 있으면 두 정보 모두 표시.</p>
  <table>
    <thead><tr><th>부위</th><th>사용 소재</th><th>비고</th></tr></thead>
    <tbody>
      <tr><td>본체 내장재</td><td>...</td><td>...</td></tr>
      <tr><td>등쿠션</td><td>...</td><td>...</td></tr>
      <tr><td>프레임</td><td>...</td><td>...</td></tr>
      <tr><td>다리</td><td>...</td><td>...</td></tr>
    </tbody>
  </table>
</section>

<section class="features">
  <h2>⭐ 제품 특장점</h2>
  <ul>
    <li><strong>특장점 1</strong>: 구체적 설명</li>
    <li><strong>특장점 2</strong>: ...</li>
  </ul>
</section>

<section class="alerts">
  <h2>⚠️ 단종 / 사양변경 알림</h2>
  <p class="alert-note">학생 일지에서 발견된 변경/단종 정보를 정리합니다. PPT에는 없지만 현장에서 들은 새 정보가 핵심입니다.</p>
  <ul>
    <li>변경/단종 항목 1 <cite>학생명, 기수·날짜</cite></li>
  </ul>
  <!-- 일지에서 변경 정보 못 찾으면: <p>현재까지 보고된 단종/사양변경 정보 없음.</p> -->
</section>

<section class="store-tips">
  <h2>💡 매장 실전 팁</h2>
  <ul>
    <li><strong>팁 제목</strong>: 매장에서만 알 수 있는 노하우, 고객 응대 사례 <cite>학생명, 기수·날짜</cite></li>
  </ul>
</section>

<div class="photo-placeholder">[추가 사진 — 라인업/색상/디테일]</div>

<section class="insights">
  <h2>🎓 학생 깨달음 사례</h2>
  <blockquote>
    인용문 핵심 메시지
    <cite>학생명, 기수·날짜</cite>
  </blockquote>
  <p>맥락 설명</p>
</section>
\`\`\`

# 기존 PPT 자료 (시드 — ${seriesName} 관련 슬라이드만)
${seedsBlock}

# 교육일지 (${educationNotes.length}건)
${educationNotes.map(formatNote).join('\n\n')}

# 자율학습 일지 (${selfStudyNotes.length}건)
${selfStudyNotes.map(formatNote).join('\n\n')}

위 9섹션 HTML만 출력하세요. \`\`\`html\`\`\` 펜스 없이 바로 <section>부터 시작.
표 안의 셀은 절대 비우지 말고 정보 없으면 "(자료 부족)"으로 채우세요.
일지에서 단종/사양변경 정보를 못 찾으면 alerts 섹션에 "현재까지 보고된 단종/사양변경 정보 없음." 한 줄만 넣으세요.`;
}

export interface ClassifyResult {
  note_id: string;
  series: string[];
  confidence: number;
}

/** Gemini 응답에서 JSON 부분만 추출 */
export function parseClassifyResponse(text: string): ClassifyResult[] {
  // 마크다운 펜스 제거
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  // 첫 [ ... ] 추출
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!arrMatch) return [];

  try {
    const parsed = JSON.parse(arrMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === 'object' && typeof x.note_id === 'string')
      .map((x) => ({
        note_id: x.note_id,
        series: Array.isArray(x.series) ? x.series.filter((s: unknown) => typeof s === 'string') : [],
        confidence: typeof x.confidence === 'number' ? x.confidence : 0,
      }));
  } catch {
    return [];
  }
}

/** Gemini 응답에서 HTML 부분만 추출 (펜스 제거) */
export function parseDraftResponse(text: string): string {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  return cleaned;
}
