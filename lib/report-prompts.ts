/**
 * AI 코칭 리포트 프롬프트 빌더
 *
 * Claude Code에 붙여넣을 프롬프트를 생성합니다.
 * Claude Code가 Supabase DB에서 직접 데이터를 읽고 분석 리포트를 생성/저장합니다.
 */

interface StudentInfo {
  id: string;
  name: string;
  store_location?: string | null;
}

interface BatchInfo {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

// 종합분석 프롬프트
export function buildComprehensivePrompt(batch: BatchInfo, students: StudentInfo[]): string {
  const studentList = students.map(s => `- ${s.name} (id: ${s.id}${s.store_location ? `, 매장: ${s.store_location}` : ''})`).join('\n');
  const today = new Date().toISOString().split('T')[0];
  const groupId = `comp_${today}_${Date.now()}`;

  return `# 일룸 입문교육 종합 분석 리포트 생성

## 역할
당신은 일룸(iloom) 가구 신입사원 교육 담당 20년차 베테랑 강사입니다.
일룸의 가구 소재(LPM, HPM, PP, 무늬목, 엣지), 제품 시리즈(팅클팝, 로이, 뉴트, 멘디, 링키플러스 등),
색상 코드, 규격, 시공/설치에 대한 전문 지식을 보유하고 있습니다.
매장 관리자/선임에게 전달하는 **인수인계 리포트**를 작성합니다.

## 대상
- 기수: ${batch.name} (${batch.start_date} ~ ${batch.end_date})
- batch_id: ${batch.id}
- 교육생:
${studentList}

## Step 1: 데이터 수집

Supabase DB에서 아래 데이터를 수집하세요.
프로젝트 경로: \`c:\\Users\\suzzz\\Desktop\\iloom_workspace\\5. iloom_입문교육\`
환경변수 파일: \`.env.local\` (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

각 학생별로 다음 7개 테이블에서 데이터를 읽으세요:

1. **test_scores** — \`WHERE student_id = :id ORDER BY test_date\`
   → 차시별 점수, 성장 곡선
2. **test_responses + questions** — \`test_responses WHERE student_id = :id\` JOIN \`questions ON session+question_id\`
   → 카테고리(category)/시리즈(series)/상세(detail)별 정답률, 반복 오답 문항
3. **student_notes** — \`WHERE student_id = :id\`
   → content를 JSON 파싱: steps(step1/step2/step3/step4), meta(tags, confidence)
   → **교육일지** (태그에 '실습일지' 미포함): step1=오늘 배운 핵심, step2=어려웠던 점, step3=내일 목표. confidence=자신감(confident/half/low)
   → **실습일지** (태그에 '실습일지' 포함):
     - step1=기억에 남는 고객 (현장 상담 경험)
     - step2=선배에게 배운 비법 (멘토링 수용도)
     - step3=오늘 나에게 칭찬할 점 (자기긍정, 성장 인식)
     - step4=보완할 점 (자기인식, 개선 의지)
     - stats: stats_consult(상담건수), stats_estimate(견적건수), stats_order(수주건수), stats_amount(수주금액)
   → 실습일지의 step3/step4는 학생의 **자기인식과 태도**를 파악하는 핵심 데이터. 피드백에 반드시 반영할 것.
   → 실습일지도 교육자 메모와 마찬가지로 **생활기록부 톤으로 리라이팅**하여 피드백에 녹이기
4. **student_memos** — \`WHERE student_id = :id ORDER BY created_at\`
   → 카테고리별(behavior/counsel/praise/caution/general) 교육자 관찰 기록
5. **attendance** — \`WHERE student_id = :id\`
   → 출석/지각/결석 집계
6. **student_questions** — \`WHERE student_id = :id\`
   → 질문 내용과 빈도 (적극성 지표)
7. **coaching_reports** — \`WHERE student_id = :id AND report_type != 'comprehensive'\`
   → 이전 코칭 기록 (있으면 참고)

## Step 2: 교육자 메모 전문 리라이팅

교육자(수지)가 남긴 메모(student_memos)를 **생활기록부 톤으로 전문적 리라이팅**하세요.
이 단계가 가장 중요합니다. 원문을 그대로 쓰지 마세요.

### 리라이팅 원칙:
- **부정적 표현 → 건설적 표현**: "점수 낮음" → "기초 역량 강화가 필요한 단계", "소심함" → "신중하고 조심스러운 성향"
- **구어체 → 문어체**: "공부 열심히 함" → "학습에 대한 높은 의지를 보임"
- **직접적 지적 → 개선 방향 제시**: "수동적인 태도" → "능동적 참여를 이끌어내기 위한 지원이 필요"
- **강점은 볼드(\*\*)**, 유의사항은 형광펜(==)==으로 마킹
- **구체적인 관찰 내용은 살리되** 표현만 전문적으로 다듬기 (예: "SCT 교육 주도" → 그대로 유지)

### 리라이팅 예시:

원문: "점수 너무 낮음을 안내. 타교육생들에 비해 수업태도 또한 적극적이지 않음. 공부를 열심히 하고자 하나 숙지하는 속도가 느림"
→ 리라이트: "현재 기초 역량 강화가 필요한 단계에 있으며, 본인도 이를 인지하고 있음. 타 교육생 대비 ==수업 중 적극성이 다소 부족==한 편으로, 발표나 질문을 유도하는 환경이 효과적임. **학습 의지는 있으나 새로운 내용을 숙지하는 데 시간이 필요한 스타일**로, 소량 반복 학습이 효과적임."

원문: "컨디션이 좋을 때와 아닐 때가 매우 다름. 관심없는 것은 좋지 못한 수업태도를 보임"
→ 리라이트: "==컨디션에 따른 학습 집중도 편차==가 관찰됨. **흥미 영역과 비흥미 영역 간 몰입도 차이**가 뚜렷한 편으로, 비관심 영역은 실물 체험 위주의 흥미 유발 교육이 효과적임."

원문: "초반에 점수 매우 좋지 않음을 안내. 이후 교육일지나 계속 노력하고자 하는 태도를 보이며 교육 중반부에서는 시험 1등을 하는 쾌거"
→ 리라이트: "교육 초반에는 학습 성과가 기대에 미치지 못했으나, 지속적인 독려 이후 ==자기주도 학습에 꾸준히 노력하는 태도==를 보임. 교육 중반부에는 **시험 1등을 달성하는 성과**를 거두며 노력이 결실을 맺는 모습이 인상적이었음."

각 학생의 메모를 리라이팅한 후, 아래 리포트 구조의 "신입에 대한 전반적인 피드백" 섹션에 녹여서 작성하세요.

## Step 3: 리포트 생성

각 학생별로 아래 구조의 리포트를 생성하세요.
기존 엑셀 리포트(입문교육_강동아이파크점.xlsx 등)를 참고하여 **매장 관리자가 즉시 활용할 수 있는** 실용적 문서를 만드세요.

### 리포트 구조:

\`\`\`
📋 신입에 대한 전반적인 피드백

(문단형 3~5문장. 아래 내용을 종합하여 자연스럽게 작성)
- 교육일지에서 드러난 학습 태도, 자신감, 적극성
- 교육자 메모의 관찰 기록 (칭찬/주의/상담 내용)
- 실습일지의 현장 경험 (상담/수주 건수 등)
- 시험 성적 추이와 학습 스타일
- 성격적 특성과 매장 배치 후 유의사항

📊 교육 과정 체크리스트

카테고리별 시험 정답률을 기준으로 O/△/X 판정:
- O (≥80%): 잘 숙지함
- △ (50~80%): 추가 학습 필요
- X (<50% 또는 미출제): 재교육 필요

자립도 3단계:
- 🟢 혼자 가능: 정답률 80%+
- 🟡 감독 필요: 정답률 50~80%
- 🔴 재교육 필요: 정답률 50% 미만 또는 미출제

테이블 형식:
| 영역 | 상태 | 자립도 | 전달사항 |
|------|------|--------|---------|
(questions 테이블의 category 기준으로 분류)

📈 시험 성적 요약

- 전체 평균: XX점 (반 평균 대비 +/-XX)
- 성장 추이: 첫 시험 XX점 → 마지막 XX점
- 최고 차시: X차 (XX점) / 최저 차시: X차 (XX점)

🚨 반복 오답 문항 (2회 이상 틀린 문제)

실제 틀린 문제를 나열:
Q. [문제 텍스트]
   ❌ 학생 답: [오답] → ✅ 정답: [정답] (X차, X차에서 오답)

🏷️ 지속 취약 유형 요약

- 반복 오답을 유형별 분류 (사이즈/색상/소재/기능구조 등)
- 극복한 영역 vs 고질적 약점

📝 매장 관리자에게 전달사항

- 추가 교육이 필요한 분야
- 주의해서 봐줄 부분
- 강점을 살릴 수 있는 역할 제안

🎯 첫 주 우선 교육 추천

"배치 후 첫 주에 이것부터 시키세요" 액션 아이템 3~5개
구체적이고 실행 가능한 항목으로 (예: "커넥트플러스 수주 등록 직접 해보기", "소파 색상 코드 매장 전시품 보며 암기")
\`\`\`

## Step 4: DB 저장

각 학생의 리포트를 coaching_reports 테이블에 저장하세요.

\`\`\`javascript
// Supabase 클라이언트 생성
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 학생별로 저장
await supabase.from('coaching_reports').upsert({
  student_id: '학생ID',
  test_date: '${today}',
  student_message: '',  // 사용 안 함
  manager_report: '위에서 생성한 전체 리포트 텍스트',
  tag_tracking: {
    overcome: ['극복한 태그들'],
    newWeak: ['새 약점 태그들'],
    chronic: ['고질적 약점 태그들']
  },
  report_type: 'comprehensive',
  report_group_id: '${groupId}',
  subject: null
}, { onConflict: 'student_id,test_date,report_type' });
\`\`\`

## 주의사항
- 한국어로 작성
- 데이터에 기반한 분석만 (추측 금지)
- **교육자 메모는 절대 원문 그대로 쓰지 말 것** — Step 2의 리라이팅 원칙에 따라 전문적으로 다듬기
- 피드백은 **생활기록부 톤** — "~을 보임", "~이 관찰됨", "~이 효과적임"
- 강점은 \*\*볼드\*\*, 유의사항은 ==형광펜==으로 마킹
- 퇴사자(is_dropped=true)는 제외
- 리포트는 매장 관리자/선임이 읽는 문서 — 전문적이되 간결하게
- 반복 오답 문항은 실제 문제 텍스트 + 학생 답 + 정답을 포함
- 교육일지의 자신감(confidence), 실습일지의 상담/수주 건수도 피드백에 반영
`;
}

// 분야별 분석 프롬프트
export function buildSubjectPrompt(batch: BatchInfo, students: StudentInfo[], subjectCategory: string): string {
  const studentList = students.map(s => `- ${s.name} (id: ${s.id})`).join('\n');
  const today = new Date().toISOString().split('T')[0];
  const groupId = `subj_${today}_${Date.now()}`;

  return `# 일룸 입문교육 분야별 분석 리포트 생성

## 역할
당신은 일룸(iloom) 가구 신입사원 교육 담당 20년차 베테랑 강사입니다.
**${subjectCategory}** 분야에 대한 학생별 심층 분석을 수행합니다.

## 대상
- 기수: ${batch.name} (${batch.start_date} ~ ${batch.end_date})
- batch_id: ${batch.id}
- 분석 분야: ${subjectCategory}
- 교육생:
${studentList}

## Step 1: 데이터 수집

프로젝트 경로: \`c:\\Users\\suzzz\\Desktop\\iloom_workspace\\5. iloom_입문교육\`
환경변수: \`.env.local\`

각 학생별로:
1. **test_responses + questions** — questions의 \`category = '${subjectCategory}'\`에 해당하는 응답만 필터
   → 세부 시리즈(series)/상세(detail)별 정답률
   → 반복 오답 문항 (실제 문제 텍스트 + 학생 답 + 정답)
2. **test_scores** — 해당 분야 관련 차시의 점수
3. **student_notes** — 해당 분야 관련 교육일지 내용 (키워드 매칭)

## Step 2: 분석

학생별로 아래 구조:

\`\`\`
📊 ${subjectCategory} 분야 성적
- 정답률: X% (반 평균 대비 +/-X%)
- 상태: O/△/X
- 자립도: 🟢/🟡/🔴

🔍 세부 카테고리별 정답률
| 시리즈 > 상세 | 정답률 | 상태 |
|-------------|--------|------|

🚨 반복 오답 문항
Q. [문제 텍스트]
   ❌ [오답] → ✅ [정답] (X차에서 오답)

💡 교육 추천
- 해당 분야 집중 학습 포인트 2~3개
\`\`\`

## Step 3: DB 저장

\`\`\`javascript
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

await supabase.from('coaching_reports').upsert({
  student_id: '학생ID',
  test_date: '${today}',
  student_message: '',
  manager_report: '리포트 텍스트',
  tag_tracking: { overcome: [], newWeak: [], chronic: [] },
  report_type: 'subject',
  report_group_id: '${groupId}',
  subject: '${subjectCategory}'
}, { onConflict: 'student_id,test_date,report_type' });
\`\`\`

## 주의사항
- 한국어로 작성
- 데이터 기반 분석만
- 퇴사자 제외
- 반복 오답은 실제 문제 텍스트 포함
`;
}

// 사용 가능한 카테고리 목록 (questions 테이블의 category 값들)
export const REPORT_CATEGORIES = [
  '키즈', '스터디', '서재', '침실', '거실', '다이닝',
  '소재', '영업', '전산', '브랜드', '공통지식'
] as const;

export const REPORT_TYPE_LABELS: Record<string, string> = {
  daily: '일일 분석',
  subject: '분야별 분석',
  weekly: '주간 분석',
  comprehensive: '종합 분석',
  practice: '매장 실습 보고서',
};
