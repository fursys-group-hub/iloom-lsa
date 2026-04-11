import type { TestScore, WrongAnswer, Attendance, TagTracking, StudentWithStats, Student, AdaptationIndex, RiskCheck, HRAdvice, AdviceType } from './types';

// 위험 학생 판별
export function calculateRiskLevel(
  recentScores: TestScore[],
  attendance: Attendance[]
): 'high' | 'medium' | 'low' {
  // 결석 2회 이상 → high
  const absentCount = attendance.filter((a) => a.status === 'absent').length;
  if (absentCount >= 2) return 'high';

  // 최근 3일 평균 < 60 → high (위험)
  const last3Days = getLastNDaysScores(recentScores, 3);
  if (last3Days.length > 0) {
    const avg = last3Days.reduce((sum, s) => sum + s.score, 0) / last3Days.length;
    if (avg < 60) return 'high';
  }

  // 지각 3회 이상 → medium
  const lateCount = attendance.filter((a) => a.status === 'late').length;
  if (lateCount >= 3) return 'medium';

  // 최근 3일 평균 < 80 → medium (주의)
  if (last3Days.length > 0) {
    const avg = last3Days.reduce((sum, s) => sum + s.score, 0) / last3Days.length;
    if (avg < 80) return 'medium';
  }

  // 80점 이상 → low (양호)
  return 'low';
}

function getLastNDaysScores(scores: TestScore[], days: number): TestScore[] {
  const sorted = [...scores].sort(
    (a, b) => new Date(b.test_date).getTime() - new Date(a.test_date).getTime()
  );
  const dates = [...new Set(sorted.map((s) => s.test_date))].slice(0, days);
  return sorted.filter((s) => dates.includes(s.test_date));
}

function hasConsecutiveLowScores(
  scores: TestScore[],
  consecutiveCount: number,
  threshold: number
): boolean {
  const bySubject = new Map<string, TestScore[]>();
  for (const s of scores) {
    const arr = bySubject.get(s.subject) || [];
    arr.push(s);
    bySubject.set(s.subject, arr);
  }

  for (const [, subjectScores] of bySubject) {
    const sorted = subjectScores.sort(
      (a, b) => new Date(b.test_date).getTime() - new Date(a.test_date).getTime()
    );
    let consecutive = 0;
    for (const s of sorted) {
      if (s.score < threshold) {
        consecutive++;
        if (consecutive >= consecutiveCount) return true;
      } else {
        consecutive = 0;
      }
    }
  }
  return false;
}

// 취약 태그 추적
export function trackTags(
  previousWrongAnswers: WrongAnswer[],
  currentWrongAnswers: WrongAnswer[]
): TagTracking {
  const previousTags = new Set(previousWrongAnswers.flatMap((w) => w.tags));
  const currentTags = new Set(currentWrongAnswers.flatMap((w) => w.tags));

  const overcome = [...previousTags].filter((t) => !currentTags.has(t));
  const newWeak = [...currentTags].filter((t) => !previousTags.has(t));
  const chronic = [...currentTags].filter((t) => previousTags.has(t));

  return { overcome, newWeak, chronic };
}

// 학생 평균 점수 계산
export function calculateAvgScore(scores: TestScore[]): number {
  if (scores.length === 0) return 0;
  return Math.round(
    (scores.reduce((sum, s) => sum + s.score, 0) / scores.length) * 10
  ) / 10;
}

// 과목별 평균 계산
export function calculateSubjectAverages(
  scores: TestScore[]
): { subject: string; avg: number }[] {
  const bySubject = new Map<string, number[]>();
  for (const s of scores) {
    const arr = bySubject.get(s.subject) || [];
    arr.push(s.score);
    bySubject.set(s.subject, arr);
  }

  return [...bySubject.entries()].map(([subject, values]) => ({
    subject,
    avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
  }));
}

// 성장 기울기 계산: 처음 3회 평균 vs 마지막 3회 평균
export function calculateGrowthSlope(scores: TestScore[]): number {
  if (scores.length < 2) return 0;
  const sorted = [...scores].sort((a, b) => a.test_date.localeCompare(b.test_date));
  const dates = [...new Set(sorted.map(s => s.test_date))];
  if (dates.length < 2) return 0;

  const firstN = Math.min(3, Math.ceil(dates.length / 2));
  const lastN = Math.min(3, Math.ceil(dates.length / 2));
  const firstDates = new Set(dates.slice(0, firstN));
  const lastDates = new Set(dates.slice(-lastN));

  const firstScores = sorted.filter(s => firstDates.has(s.test_date));
  const lastScores = sorted.filter(s => lastDates.has(s.test_date));

  const firstAvg = firstScores.length > 0
    ? firstScores.reduce((sum, s) => sum + s.score, 0) / firstScores.length : 0;
  const lastAvg = lastScores.length > 0
    ? lastScores.reduce((sum, s) => sum + s.score, 0) / lastScores.length : 0;

  return lastAvg - firstAvg;
}

// 성장 기울기를 0~100 점수로 정규화 (-30~+30 범위)
function normalizeGrowthSlope(slope: number): number {
  return Math.max(0, Math.min(100, ((slope + 30) / 60) * 100));
}

// 출석률 계산 (late=0.5 가중치)
function calculateAttendanceRate(attendance: Attendance[], totalDays: number): number {
  if (totalDays === 0) return 0;
  let score = 0;
  for (const a of attendance) {
    if (a.status === 'present') score += 1;
    else if (a.status === 'late' || a.status === 'early_leave') score += 0.5;
  }
  return Math.min(100, (score / totalDays) * 100);
}

// 자신감 추이 점수 (상승=100, 유지=50, 하락=0)
function calculateConfidenceTrend(notes: { confidence?: string | null; created_at: string }[]): number {
  const withConf = notes
    .filter(n => n.confidence)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (withConf.length < 2) return 50; // 데이터 부족 → 중립

  // 5단계: very_confident=5, confident=4, normal=3, uncertain=2, need_help=1
  // 기존 4단계 데이터 호환: 구 confident→5, understood→4, half→2
  const confToNum = (c: string | null | undefined): number => {
    if (!c) return 3;
    const lower = c.toLowerCase();
    if (lower === 'very_confident') return 5;
    if (lower === 'confident' || lower === '높음') return 5; // 기존 confident도 최상위로 호환
    if (lower === 'understood') return 4; // 기존 understood → 자신있어요
    if (lower === 'normal' || lower === '보통') return 3;
    if (lower === 'uncertain' || lower === 'half') return 2; // 기존 half → 알쏭달쏭
    if (lower === 'need_help' || lower === 'low' || lower === '낮음') return 1;
    return 3;
  };

  const firstN = Math.min(3, Math.ceil(withConf.length / 2));
  const lastN = Math.min(3, Math.ceil(withConf.length / 2));
  const firstAvg = withConf.slice(0, firstN).reduce((s, n) => s + confToNum(n.confidence), 0) / firstN;
  const lastAvg = withConf.slice(-lastN).reduce((s, n) => s + confToNum(n.confidence), 0) / lastN;

  const diff = lastAvg - firstAvg; // -4 ~ +4 범위
  return Math.max(0, Math.min(100, ((diff + 4) / 8) * 100));
}

// 가중치 상수 (2기 때 조정 예정)
// 질문 빈도 제거: 실제 질문이 아닌 것도 포함될 수 있어 정확도 낮음
// v2 (2026-04-11): 성장 기울기 / 만성 오답 / 메모 톤 추가 + 재배분
// 실습일지 제외: 교육일지 참여와 동일 개념이라 중복
const ADAPTATION_WEIGHTS = {
  examAvg: 0.30,           // 시험 평균 (가장 중요)
  weakCategories: 0.15,    // 하위 분야 적을수록 좋음
  attendanceRate: 0.13,    // 출석률
  participation: 0.15,     // 교육일지 참여 (12 + 3 실습일지 분)
  confidenceTrend: 0.08,   // 자신감 추이 (미입력 시 다른 항목으로 분산)
  growthSlope: 0.10,       // 성장 기울기 (떨어지면 페널티)
  chronicScore: 0.05,      // 만성 오답 비율 (낮을수록 좋음)
  memoBalance: 0.04,       // 교육자 메모 톤 밸런스 (칭찬-주의)
};

// 하위 분야(60점 미만) 개수를 0~100 점수로 변환
// 0개 = 100점, 전부 하위 = 0점
function weakCategoryScore(weakCount: number, totalCategories: number): number {
  if (totalCategories === 0) return 50;
  return Math.round(((totalCategories - weakCount) / totalCategories) * 100);
}

// 만성 오답(chronic) 태그 비율 → 점수 (낮을수록 좋음)
// chronic 비율 0% = 100점, 50%+ = 0점
function chronicToScore(chronicCount: number, totalWeakCount: number): number {
  if (totalWeakCount === 0) return 70; // 데이터 부족 → 약간 긍정 중립
  const ratio = chronicCount / totalWeakCount;
  return Math.max(0, Math.min(100, Math.round((1 - ratio * 2) * 100)));
}

// 메모 톤 밸런스 → 점수
// praise만 = 100, 반반 = 50, caution만 = 0, 메모 없음 = 50(중립)
function memoToneScore(praise: number, caution: number): number {
  const total = praise + caution;
  if (total === 0) return 50;
  return Math.round((praise / total) * 100);
}

// 입문교육 적응 지수 계산
export function calculateAdaptationIndex(params: {
  studentId: string;
  studentName: string;
  scores: TestScore[];
  attendance: Attendance[];
  notes: { participation_score?: number; confidence?: string | null; tags?: string[]; created_at: string }[];
  totalEducationDays: number;
  // 카테고리별 정답률 (외부에서 계산해서 전달)
  categoryRates: { category: string; rate: number }[];
  // 🆕 교육자 메모 카테고리 (praise/caution 등)
  memoCategories?: string[];
  // 🆕 코칭 리포트의 tag_tracking (만성 오답 계산용)
  tagTrackings?: (TagTracking | null)[];
}): AdaptationIndex {
  const {
    studentId, studentName, scores, attendance, notes, totalEducationDays, categoryRates,
    memoCategories = [], tagTrackings = [],
  } = params;

  // 교육일지만 필터 (실습일지, 자율학습 제외)
  const educationNotes = notes.filter(n => {
    const tags = n.tags || [];
    return !tags.includes('실습일지') && !tags.includes('자율학습');
  });

  // 1. 시험 평균
  const examAvg = calculateAvgScore(scores);

  // 2. 하위 분야 개수 (60점 미만) — 카테고리 이름도 함께 반환
  const weakCategoryList = categoryRates.filter(c => c.rate < 60);
  const weakCategoryCount = weakCategoryList.length;
  const weakCategoryNames = weakCategoryList.map(c => c.category);
  const totalCategories = categoryRates.length;
  const weakCatScore = weakCategoryScore(weakCategoryCount, totalCategories);

  // 3. 출석률
  const attendanceRate = calculateAttendanceRate(attendance, totalEducationDays);

  // 4. 교육일지 참여
  const eduNoteCount = educationNotes.length;
  const participation = eduNoteCount > 0
    ? (educationNotes.reduce((sum, n) => sum + (n.participation_score || 0), 0) / eduNoteCount / 3) * 100
    : 0;
  const participationDetail = `${eduNoteCount}일 작성, 평균 참여 ${Math.round(participation)}%`;

  // 5. 자신감 추이
  const confNotes = educationNotes.filter(n => n.confidence);
  const hasConfidenceData = confNotes.length >= 2;
  const confidenceTrend = calculateConfidenceTrend(educationNotes);

  // 자신감 상세 텍스트 (5단계: 높음/자신/보통/알쏭/도움)
  let confidenceDetail = '미입력';
  if (confNotes.length > 0) {
    const confCounts = { high: 0, confident: 0, normal: 0, uncertain: 0, low: 0 };
    for (const n of confNotes) {
      const c = (n.confidence || '').toLowerCase();
      if (c === 'very_confident') confCounts.high++;
      else if (c === 'confident' || c === 'understood' || c === '높음') confCounts.confident++;
      else if (c === 'normal' || c === '보통') confCounts.normal++;
      else if (c === 'uncertain' || c === 'half') confCounts.uncertain++;
      else if (c === 'need_help' || c === 'low' || c === '낮음') confCounts.low++;
    }
    const trend = confidenceTrend > 60 ? '↑ 상승' : confidenceTrend < 40 ? '↓ 하락' : '→ 유지';
    confidenceDetail = `😎${confCounts.high} 😊${confCounts.confident} 😐${confCounts.normal} 🤔${confCounts.uncertain} 😵${confCounts.low} ${trend}`;
  }

  // 🆕 6. 성장 기울기 (마지막 3차시 - 초반 3차시)
  const growthSlopeRaw = calculateGrowthSlope(scores);
  const growthSlope = normalizeGrowthSlope(growthSlopeRaw);
  const slopeDirection = growthSlopeRaw > 2 ? '↑ 성장' : growthSlopeRaw < -2 ? '↓ 하락' : '→ 유지';
  const growthDetail = scores.length < 2
    ? '데이터 부족'
    : `${slopeDirection} (${growthSlopeRaw >= 0 ? '+' : ''}${growthSlopeRaw.toFixed(1)}점)`;

  // 🆕 7. 만성 오답 비율
  const latestTracking = [...tagTrackings]
    .filter((t): t is TagTracking => !!t)
    .pop(); // 최신 리포트
  let chronicCount = 0;
  let totalWeakTagCount = 0;
  if (latestTracking) {
    chronicCount = latestTracking.chronic?.length || 0;
    totalWeakTagCount = chronicCount + (latestTracking.newWeak?.length || 0);
  }
  const chronicScore = chronicToScore(chronicCount, totalWeakTagCount);
  const chronicDetail = latestTracking
    ? `만성 ${chronicCount}개 / 신규 약점 ${latestTracking.newWeak?.length || 0}개`
    : '리포트 없음';

  // 🆕 8. 교육자 메모 톤 밸런스
  const praiseCount = memoCategories.filter(c => c === 'praise').length;
  const cautionCount = memoCategories.filter(c => c === 'caution').length;
  const memoBalance = memoToneScore(praiseCount, cautionCount);
  const memoBalanceDetail = praiseCount + cautionCount === 0
    ? '메모 없음'
    : `칭찬 ${praiseCount}건, 주의 ${cautionCount}건`;

  // 🆕 9. 부정 신호 델타 감점 (최대 -8점)
  let deltaDeduction = 0;
  const deltaReasons: string[] = [];
  if (scores.length >= 4 && growthSlopeRaw < -5) {
    deltaDeduction += 5;
    deltaReasons.push(`성적 하락 ${growthSlopeRaw.toFixed(0)}점`);
  }
  if (hasConfidenceData && confidenceTrend < 35) {
    deltaDeduction += 3;
    deltaReasons.push('자신감 급락');
  }
  const deltaDetail = deltaReasons.length > 0 ? deltaReasons.join(', ') : '없음';

  // 종합 점수 계산
  // 자신감 미입력 시 해당 가중치(8%)를 시험평균(+4) + 참여(+4)로 분산
  const w = { ...ADAPTATION_WEIGHTS };
  if (!hasConfidenceData) {
    w.examAvg += 0.04;
    w.participation += 0.04;
    w.confidenceTrend = 0;
  }
  const confScore = hasConfidenceData ? confidenceTrend : 0;
  const rawTotal =
    examAvg * w.examAvg +
    weakCatScore * w.weakCategories +
    attendanceRate * w.attendanceRate +
    participation * w.participation +
    confScore * w.confidenceTrend +
    growthSlope * w.growthSlope +
    chronicScore * w.chronicScore +
    memoBalance * w.memoBalance;

  const total = Math.max(0, Math.min(100, Math.round(rawTotal - deltaDeduction)));

  const group = total >= 75 ? 'high' : total >= 50 ? 'mid' : 'low';

  return {
    studentId,
    studentName,
    total,
    group,
    breakdown: {
      examAvg: Math.round(examAvg),
      weakCategories: weakCatScore,
      weakCategoryCount,
      totalCategories,
      weakCategoryNames,
      attendanceRate: Math.round(attendanceRate),
      participation: Math.round(participation),
      participationDetail,
      confidenceTrend: Math.round(confScore),
      confidenceDetail,
      hasConfidenceData,
      growthSlope: Math.round(growthSlope),
      growthSlopeRaw: Math.round(growthSlopeRaw * 10) / 10,
      growthDetail,
      chronicScore: Math.round(chronicScore),
      chronicDetail,
      memoBalance: Math.round(memoBalance),
      memoBalanceDetail,
      deltaDeduction,
      deltaDetail,
    },
  };
}

// 위험 교육생 체크리스트
// 질문 항목 제거 (실제 질문이 아닌 것도 포함될 수 있음)
// 자신감 미입력 시 위험 판정에서 제외
export function calculateRiskChecklist(params: {
  studentId: string;
  studentName: string;
  scores: TestScore[];
  attendance: Attendance[];
  notes: { participation_score?: number; confidence?: string | null; tags?: string[]; created_at: string }[];
  memoCategories: string[];
  totalEducationDays: number;
  categoryRates: { category: string; rate: number }[];
}): RiskCheck {
  const { studentId, studentName, scores, attendance, notes, memoCategories, totalEducationDays, categoryRates } = params;

  const checks: RiskCheck['checks'] = [];

  // 1. 시험 평균 < 60
  const avg = calculateAvgScore(scores);
  checks.push({
    label: '시험 평균 60점 미만',
    triggered: avg < 60,
    value: `${avg}점`,
  });

  // 2. 하위 분야(60점 미만) 4개 이상 (전체의 절반 이상이 약해야)
  const weakCount = categoryRates.filter(c => c.rate < 60).length;
  checks.push({
    label: '하위 분야 4개 이상',
    triggered: weakCount >= 4,
    value: `${weakCount}/${categoryRates.length}개`,
  });

  // 3. 출석률 < 80%
  const attRate = calculateAttendanceRate(attendance, totalEducationDays);
  checks.push({
    label: '출석률 80% 미만',
    triggered: attRate < 80,
    value: `${Math.round(attRate)}%`,
  });

  // 4. 자신감 3회 연속 low (미입력이면 "미입력"으로 표시, 위험 아님)
  const educationOnlyNotes = notes.filter(n => !n.tags?.includes('실습일지') && !n.tags?.includes('자율학습'));
  const confNotes = educationOnlyNotes
    .filter(n => n.confidence)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const last3Conf = confNotes.slice(0, 3);
  const hasEnoughData = last3Conf.length >= 3;
  const consecutive3Low = hasEnoughData &&
    last3Conf.every(n => {
      const c = (n.confidence || '').toLowerCase();
      return c === 'need_help' || c === 'uncertain' || c === 'low' || c === '낮음' || c === 'half';
    });
  checks.push({
    label: '자신감 3회 연속 낮음',
    triggered: consecutive3Low,
    value: hasEnoughData ? last3Conf.map(n => n.confidence).join(', ') : '미입력',
  });

  // 5. 교육자 메모 caution 2건+
  const cautionCount = memoCategories.filter(c => c === 'caution').length;
  checks.push({
    label: '주의 메모 2건 이상',
    triggered: cautionCount >= 2,
    value: `${cautionCount}건`,
  });

  // 🆕 6. 최근 하락 신호 — 점수가 괜찮아도 "조용히 무너지는" 학생 감지
  // 성적 -5점 이하 하락 OR 자신감 추이 35점 미만
  const slope = calculateGrowthSlope(scores);
  const hasConfData = educationOnlyNotes.filter(n => n.confidence).length >= 2;
  const confTrend = calculateConfidenceTrend(educationOnlyNotes);
  const slopeDropped = scores.length >= 4 && slope < -5;
  const confDropped = hasConfData && confTrend < 35;
  const recentDecline = slopeDropped || confDropped;
  const declineReasons: string[] = [];
  if (slopeDropped) declineReasons.push(`성적 ${slope.toFixed(1)}점`);
  if (confDropped) declineReasons.push('자신감 급락');
  checks.push({
    label: '최근 하락 신호',
    triggered: recentDecline,
    value: recentDecline ? declineReasons.join(', ') : '안정',
  });

  return {
    studentId,
    studentName,
    checks,
    riskCount: checks.filter(c => c.triggered).length,
  };
}

// ═══════════════════════════════════════════════════
// HR 조언 자동 생성 (주의 교육생 맞춤 가이드)
// ═══════════════════════════════════════════════════
// 체크된 항목 조합을 보고 7가지 유형 중 하나로 판정
// + 적응 지수의 breakdown을 참고해서 구체적인 액션 추천

const ADVICE_META: Record<AdviceType, { emoji: string; label: string; color: HRAdvice['typeColor'] }> = {
  knowledge:  { emoji: '📘', label: '지식 부족형',    color: 'red' },
  category:   { emoji: '🎯', label: '약점 편중형',    color: 'orange' },
  psych:      { emoji: '💔', label: '심리 위축형',    color: 'purple' },
  attendance: { emoji: '🚪', label: '근태/동기 이슈형', color: 'orange' },
  behavior:   { emoji: '🔍', label: '행동 관찰형',    color: 'orange' },
  complex:    { emoji: '🚨', label: '복합 위기형',    color: 'red' },
  partial:    { emoji: '💎', label: '부분 주의형',    color: 'blue' },
  descent:    { emoji: '🌊', label: '하락 징후형',    color: 'orange' },
};

// 체크 라벨 상수 (calculateRiskChecklist와 매칭)
const CHECK_LABELS = {
  lowExam: '시험 평균 60점 미만',
  manyWeakCats: '하위 분야 4개 이상',
  lowAttendance: '출석률 80% 미만',
  lowConfidence: '자신감 3회 연속 낮음',
  manyCautionMemos: '주의 메모 2건 이상',
  recentDecline: '최근 하락 신호',
} as const;

export function generateHRAdvice(
  riskCheck: RiskCheck,
  adaptation: AdaptationIndex | undefined,
): HRAdvice | null {
  const triggered = new Set(
    riskCheck.checks.filter(c => c.triggered).map(c => c.label)
  );
  if (triggered.size === 0) return null;

  const isHighGroup = adaptation?.group === 'high';
  const hasDescent = triggered.has(CHECK_LABELS.recentDecline);

  // 유형 판정 — 우선순위 순
  let type: AdviceType;

  if (isHighGroup) {
    // 상 그룹: 하락 신호 있으면 descent(강조), 없으면 partial(가볍게)
    type = hasDescent ? 'descent' : 'partial';
  } else if (triggered.size >= 3) {
    // 3개 이상 동시 해당 → 복합 위기
    type = 'complex';
  } else if (triggered.has(CHECK_LABELS.lowExam) && triggered.has(CHECK_LABELS.manyWeakCats)) {
    // 시험 평균 낮음 + 하위 분야 다수 → 지식 부족형
    type = 'knowledge';
  } else if (triggered.has(CHECK_LABELS.manyWeakCats) && !triggered.has(CHECK_LABELS.lowExam)) {
    // 평균은 괜찮은데 하위 분야만 많음 → 편중 약점형
    type = 'category';
  } else if (triggered.has(CHECK_LABELS.lowConfidence)) {
    // 자신감 지속 낮음 → 심리 위축형
    type = 'psych';
  } else if (hasDescent) {
    // 다른 신호 없이 하락만 → 조용히 무너지는 중 → 하락 징후형
    type = 'descent';
  } else if (triggered.has(CHECK_LABELS.lowAttendance)) {
    // 출석률만 문제 → 근태/동기 이슈형
    type = 'attendance';
  } else if (triggered.has(CHECK_LABELS.manyCautionMemos)) {
    // 주의 메모만 문제 → 행동 관찰형
    type = 'behavior';
  } else if (triggered.has(CHECK_LABELS.lowExam)) {
    // 시험만 낮음 (하위 분야는 적음) → 편중된 기초 부족
    type = 'knowledge';
  } else {
    type = 'behavior';
  }

  const meta = ADVICE_META[type];
  const { difficulty, actions } = buildAdviceContent(type, riskCheck, adaptation);

  return {
    studentId: riskCheck.studentId,
    type,
    typeEmoji: meta.emoji,
    typeLabel: meta.label,
    typeColor: meta.color,
    difficulty,
    actions,
  };
}

// 유형별 구체 문구 생성 — 실제 데이터(약점 카테고리 이름, 점수 등) 삽입
function buildAdviceContent(
  type: AdviceType,
  riskCheck: RiskCheck,
  adaptation: AdaptationIndex | undefined,
): { difficulty: string; actions: string[] } {
  const bd = adaptation?.breakdown;
  const weakCats = bd?.weakCategoryNames || [];
  const weakCatsText = weakCats.length > 0
    ? weakCats.slice(0, 3).join('/') + (weakCats.length > 3 ? ` 외 ${weakCats.length - 3}개` : '')
    : '';
  const examAvg = bd?.examAvg ?? 0;
  const attRate = bd?.attendanceRate ?? 0;
  const cautionMemo = riskCheck.checks.find(c => c.label === CHECK_LABELS.manyCautionMemos);
  const cautionCount = cautionMemo ? parseInt(cautionMemo.value) || 0 : 0;

  // 트리거된 체크 집합 (generateHRAdvice와 동일하게 재계산)
  const triggered = new Set(
    riskCheck.checks.filter(c => c.triggered).map(c => c.label)
  );

  switch (type) {
    case 'knowledge':
      return {
        difficulty: `시험 평균 ${examAvg}점으로 전반적인 이해가 부족하고, 암기 위주 학습이 한계에 온 상태예요. 혼자서는 따라가기 버거울 수 있어요.`,
        actions: [
          '개인 면담으로 학습 스타일 진단 (암기형 vs 이해형 체크)',
          weakCats.length > 0
            ? `약한 분야(${weakCatsText}) 기본 개념부터 1:1 보충 수업`
            : '기본 개념부터 1:1 보충 수업 편성',
          '상위 그룹 교육생과 스터디 짝 배정 (동료 학습 효과)',
        ],
      };

    case 'category':
      return {
        difficulty: weakCats.length > 0
          ? `전반 점수(${examAvg}점)는 양호한데 ${weakCatsText} 분야만 구멍이 있어요. 특정 제품군에 대한 관심도나 경험이 부족할 가능성이 커요.`
          : '전반 점수는 양호하나 일부 제품군에 편중된 약점이 있어요.',
        actions: [
          weakCats.length > 0
            ? `${weakCatsText} 제품군 오답 복습 + 실물 체험 기회 제공`
            : '약점 제품군 오답 복습 + 실물 체험 기회 제공',
          '해당 분야 맞춤 미니 퀴즈로 반복 노출',
          '강점 분야(강한 점수 카테고리)는 유지, 약점만 집중 보강',
        ],
      };

    case 'psych':
      return {
        difficulty: `시험 점수(${examAvg}점)는 실제 실력에 비해 본인이 스스로를 과소평가하고 있을 가능성이 커요. 자신감이 3회 연속 낮게 나왔어요.`,
        actions: [
          '💬 개인 면담 필수 — 어떤 부분이 불안한지 구체적으로 듣기',
          '작은 성공 경험 제공 (쉬운 과제 → 성취 인정 → 난이도 점증)',
          '상위 그룹 멘토/동료 연결해서 심리적 안전망 제공',
        ],
      };

    case 'attendance':
      return {
        difficulty: `출석률 ${attRate}%로 기본 근태에 이슈가 있어요. 건강/가정사/동기 저하 중 하나일 가능성이 있어요.`,
        actions: [
          '🍵 비공식 티타임 면담으로 사정 파악 (공식 호출 X)',
          '근태 개선 약속 + 주 단위 목표 설정',
          '동료와의 지지 체계 확인 (외로움/소외감 여부)',
        ],
      };

    case 'behavior':
      return {
        difficulty: cautionCount > 0
          ? `교육자 관찰 메모에 '주의' 항목이 ${cautionCount}건 쌓였어요. 태도/집중력/관계 중 반복 패턴이 있을 수 있어요.`
          : '교육자 관찰 메모에 주의가 누적되고 있어요. 반복 패턴 확인이 필요해요.',
        actions: [
          '주의 메모 내역 정리 → 공통 패턴 파악 (태도/집중력/관계)',
          '구체적 행동 예시를 들어 피드백 (추상적 지적 X)',
          '2주 연속 개선 없으면 HR 공식 상담 연계 검토',
        ],
      };

    case 'complex': {
      // 트리거된 항목들로 구체적 issue 요약 + 우선순위별 액션 생성
      const attRateCheck = riskCheck.checks.find(c => c.label === CHECK_LABELS.lowAttendance);
      const declineCheck = riskCheck.checks.find(c => c.label === CHECK_LABELS.recentDecline);
      const declineValue = declineCheck?.value || '';

      // 1. 어려움 문장 — 가장 큰 3개 이슈 나열
      const issues: string[] = [];
      if (triggered.has(CHECK_LABELS.lowExam)) issues.push(`시험 평균 ${examAvg}점`);
      if (triggered.has(CHECK_LABELS.manyWeakCats)) {
        issues.push(`60점 미만 분야 ${bd?.weakCategoryCount ?? 0}개`);
      }
      if (triggered.has(CHECK_LABELS.recentDecline)) issues.push(`최근 ${declineValue}`);
      if (triggered.has(CHECK_LABELS.lowAttendance)) issues.push(`출석률 ${attRateCheck?.value || ''}`);
      if (triggered.has(CHECK_LABELS.lowConfidence)) issues.push('자신감 지속 하락');
      if (triggered.has(CHECK_LABELS.manyCautionMemos)) issues.push(`주의 메모 ${cautionCount}건`);

      const issueSummary = issues.slice(0, 3).join(' · ') + (issues.length > 3 ? ' 외' : '');

      // 2. 우선순위별 액션 — 체크된 항목에 맞춰 구체적으로 생성
      const actions: string[] = [];

      // 항상 첫 번째: 긴급 면담 (문제의 핵심 포인트 언급)
      const topIssue = issues[0] || '여러 문제';
      actions.push(`이번 주 내 긴급 1:1 면담 — "${topIssue}" 부터 직접 확인`);

      // 지식/학습 문제
      if (triggered.has(CHECK_LABELS.lowExam) && triggered.has(CHECK_LABELS.manyWeakCats)) {
        // 시험+약점 동시 → 기초부터 재구축
        actions.push(
          weakCats.length > 0
            ? `${weakCatsText} 집중 1:1 튜터링 (주 2회) — 암기 말고 개념 중심으로 다시`
            : '기초 개념 재진단 + 1:1 튜터링 주 2회'
        );
      } else if (triggered.has(CHECK_LABELS.manyWeakCats) && weakCats.length > 0) {
        // 약점만 다수 → 집중 보강
        actions.push(`${weakCatsText} 제품군 오답 복습 + 실물 체험 세션`);
      } else if (triggered.has(CHECK_LABELS.lowExam)) {
        // 시험만 낮음 → 학습법 문제
        actions.push('학습법 진단 (암기형 vs 이해형) + 스터디 짝 배정');
      }

      // 하락 신호 (거의 복합형이면 자주 같이 옴)
      if (triggered.has(CHECK_LABELS.recentDecline)) {
        actions.push(`최근 ${declineValue} 원인 구체적으로 물어보기 — 학습/관계/개인사 모두 체크`);
      }

      // 심리/자신감
      if (triggered.has(CHECK_LABELS.lowConfidence)) {
        actions.push(`자신감 회복 면담 — 잘하는 점 3가지 구체적으로 짚어주고 작은 과제로 성공 경험 쌓기`);
      }

      // 근태
      if (triggered.has(CHECK_LABELS.lowAttendance)) {
        actions.push(`근태 이유 파악 (건강/가정사/동기 저하) + 매일 출근 체크인`);
      }

      // 행동/메모
      if (triggered.has(CHECK_LABELS.manyCautionMemos)) {
        actions.push(`주의 메모 ${cautionCount}건 공통 패턴 찾기 → 추상적 지적 대신 구체 행동 피드백`);
      }

      // 항상 마지막: HR 공유 + 체크인
      actions.push('HR팀에 상황 공유 + 주 2회 체크인 일정 확정 (중도 이탈 방지)');

      return {
        difficulty: `${issueSummary} — 지금 가장 우선 개입해야 할 교육생이에요. 혼자서는 회복 어려울 가능성이 크고, 중도 이탈 리스크도 있어요.`,
        actions,
      };
    }

    case 'partial':
      // 상 그룹인데 일부 항목 주의 — 가볍게
      return {
        difficulty: `전반적으로 잘하고 있는 교육생이에요(적응 지수 ${adaptation?.total ?? 0}점). 아래 한두 부분만 가볍게 챙겨주면 충분해요.`,
        actions: [
          '강점 영역 칭찬 먼저, 그 다음 약점 가볍게 언급',
          weakCats.length > 0
            ? `${weakCatsText} 부분만 짧은 보충 자료 전달`
            : '해당 약점 부분만 짧은 보충 자료 전달',
          '멘토링 톤으로 접근 (지시 X, 제안 O)',
        ],
      };

    case 'descent': {
      // 🌊 조용히 무너지는 중 — 상 그룹이어도 심리적 케어 필요
      const isHigh = adaptation?.group === 'high';
      const declineCheck = riskCheck.checks.find(c => c.label === CHECK_LABELS.recentDecline);
      const declineWhat = declineCheck?.value || '';
      return {
        difficulty: isHigh
          ? `지금까지 누적 점수(${adaptation?.total ?? 0}점)는 양호하지만, 최근 들어 ${declineWhat} — 표면상 문제없어 보여도 속으로 무너지고 있을 가능성이 커요. 점수만 보면 놓치기 쉬운 사각지대예요.`
          : `전반 점수는 아직 괜찮은데 최근 ${declineWhat} 신호가 나왔어요. 지금 잡아주지 않으면 본격적으로 무너질 수 있어요.`,
        actions: [
          '💬 "요즘 어때?" 가벼운 티타임 면담부터 시작 (추궁 X)',
          '최근 어려웠던 부분 구체적으로 물어보기 — 학습/관계/개인사',
          isHigh
            ? '완벽주의/번아웃 징후 체크 — 잘하던 애가 무너질 때 가장 위험'
            : '심리적 지지 + 학습 페이스 조정 제안',
        ],
      };
    }
  }
}

// 날짜별 평균 계산 (차트용)
export function calculateDailyAverages(
  scores: TestScore[]
): { date: string; avg: number }[] {
  const byDate = new Map<string, number[]>();
  for (const s of scores) {
    const arr = byDate.get(s.test_date) || [];
    arr.push(s.score);
    byDate.set(s.test_date, arr);
  }

  return [...byDate.entries()]
    .map(([date, values]) => ({
      date,
      avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
