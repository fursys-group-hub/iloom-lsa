// 교육 스케줄 유틸리티
// schedule: { "2026-03-23": "education", "2026-04-10": "off", ... }

export type DayType = 'education' | 'practice' | 'off';

export interface ScheduleMap {
  [date: string]: DayType;
}

/**
 * 특정 날짜의 일정 유형을 반환
 * schedule에 없는 날짜는 'off'로 처리
 */
export function getDayType(schedule: ScheduleMap | null | undefined, dateStr: string): DayType {
  if (!schedule || !dateStr) return 'off';
  return (schedule[dateStr] as DayType) || 'off';
}

/**
 * 날짜 유형에 따른 라벨/색상 정보
 */
export const DAY_TYPE_CONFIG: Record<DayType, { label: string; emoji: string; color: string; bg: string; noteType: string }> = {
  education: { label: '정규교육', emoji: '📚', color: 'var(--blue)', bg: 'var(--blue-dim)', noteType: '교육일지' },
  practice:  { label: '매장실습', emoji: '🏪', color: 'var(--orange)', bg: 'var(--orange-dim)', noteType: '실습일지' },
  off:       { label: '휴무', emoji: '🌙', color: 'var(--text-muted)', bg: 'var(--bg-hover)', noteType: '자율학습' },
};

/**
 * 교육일 수 계산 (education + practice만)
 */
export function countEducationDays(schedule: ScheduleMap | null | undefined): number {
  if (!schedule) return 0;
  return Object.values(schedule).filter(t => t === 'education').length;
}

/**
 * 특정 날짜가 제출이 필요한 날인지 (education 또는 practice)
 */
export function isSubmissionDay(schedule: ScheduleMap | null | undefined, dateStr: string): boolean {
  const type = getDayType(schedule, dateStr);
  return type === 'education' || type === 'practice';
}
