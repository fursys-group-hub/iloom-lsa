import type { TestScore, WrongAnswer, Attendance, TagTracking, StudentWithStats, Student } from './types';

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
