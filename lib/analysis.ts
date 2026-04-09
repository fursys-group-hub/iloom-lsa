import type { TestScore, WrongAnswer, Attendance, TagTracking, StudentWithStats, Student, AdaptationIndex, RiskCheck } from './types';

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
const ADAPTATION_WEIGHTS = {
  examAvg: 0.40,           // 시험 평균 (가장 중요)
  weakCategories: 0.20,    // 하위 분야 적을수록 좋음
  attendanceRate: 0.15,    // 출석률
  participation: 0.15,     // 교육일지 참여
  confidenceTrend: 0.10,   // 자신감 추이 (데이터 없으면 중립 50)
};

// 하위 분야(60점 미만) 개수를 0~100 점수로 변환
// 0개 = 100점, 전부 하위 = 0점
function weakCategoryScore(weakCount: number, totalCategories: number): number {
  if (totalCategories === 0) return 50;
  return Math.round(((totalCategories - weakCount) / totalCategories) * 100);
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
}): AdaptationIndex {
  const { studentId, studentName, scores, attendance, notes, totalEducationDays, categoryRates } = params;

  // 교육일지만 필터 (실습일지, 자율학습 제외)
  const educationNotes = notes.filter(n => {
    const tags = n.tags || [];
    return !tags.includes('실습일지') && !tags.includes('자율학습');
  });

  // 1. 시험 평균
  const examAvg = calculateAvgScore(scores);

  // 2. 하위 분야 개수 (60점 미만)
  const weakCategoryCount = categoryRates.filter(c => c.rate < 60).length;
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

  // 종합 점수 (자신감 데이터 없으면 50으로 중립 처리)
  const w = ADAPTATION_WEIGHTS;
  const confScore = hasConfidenceData ? confidenceTrend : 50;
  const total = Math.round(
    examAvg * w.examAvg +
    weakCatScore * w.weakCategories +
    attendanceRate * w.attendanceRate +
    participation * w.participation +
    confScore * w.confidenceTrend
  );

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
      attendanceRate: Math.round(attendanceRate),
      participation: Math.round(participation),
      participationDetail,
      confidenceTrend: Math.round(confScore),
      confidenceDetail,
      hasConfidenceData,
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
  notes: { confidence?: string | null; tags?: string[]; created_at: string }[];
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
  const confNotes = notes
    .filter(n => n.confidence && !n.tags?.includes('실습일지') && !n.tags?.includes('자율학습'))
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

  return {
    studentId,
    studentName,
    checks,
    riskCount: checks.filter(c => c.triggered).length,
  };
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
