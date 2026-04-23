/**
 * 심화교육 주차별 응시 기한 계산 유틸
 *
 * 규칙:
 *   - batches.advanced_start (DATE, 월요일로 가정)를 1주차 시작일로 사용
 *   - 각 주차는 월요일 00:00:00 KST ~ 일요일 23:59:59.999 KST (7일)
 *   - 기한 밖 제출은 "자기 공부용"으로 간주해 공식 기록에서 제외
 *
 * 예) advanced_start = 2026-05-04 (월)
 *     1주차: 2026-05-04 00:00 KST ~ 2026-05-10 23:59:59.999 KST
 *     2주차: 2026-05-11 00:00 KST ~ 2026-05-17 23:59:59.999 KST
 *     ...
 */

export interface WeekRange {
  startMs: number;
  endMs: number;
  startLabel: string; // "5/4"
  endLabel: string; // "5/10"
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * advanced_start(YYYY-MM-DD) → 주차별 기한 범위 계산.
 * null/invalid 면 null 반환 (필터 미적용 의미).
 */
export function computeAdvancedWeekSchedule(
  advancedStart: string | null | undefined,
): Record<number, WeekRange> | null {
  if (!advancedStart) return null;

  // YYYY-MM-DD → KST 00:00:00 기준 ms
  // 예: "2026-05-04" → "2026-05-04T00:00:00+09:00"
  const baseIso = `${advancedStart}T00:00:00+09:00`;
  const baseMs = new Date(baseIso).getTime();
  if (isNaN(baseMs)) return null;

  const result: Record<number, WeekRange> = {};
  for (let w = 1; w <= 12; w++) {
    const startMs = baseMs + (w - 1) * WEEK_MS;
    const endMs = startMs + WEEK_MS - 1; // 다음 주 시작 1ms 전 = 일요일 23:59:59.999 KST
    result[w] = {
      startMs,
      endMs,
      startLabel: formatKstMonthDay(startMs),
      endLabel: formatKstMonthDay(endMs),
    };
  }
  return result;
}

/**
 * 제출일시(ISO 또는 Date 문자열)가 해당 주차 기한 내인지 체크.
 */
export function isWithinWeek(submittedAt: string, range: WeekRange): boolean {
  const ms = new Date(submittedAt).getTime();
  if (isNaN(ms)) return false;
  return ms >= range.startMs && ms <= range.endMs;
}

/**
 * KST 기준 "M/D" 라벨 (예: "5/4")
 */
function formatKstMonthDay(ms: number): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(ms));
  const month = parts.find((p) => p.type === 'month')?.value ?? '?';
  const day = parts.find((p) => p.type === 'day')?.value ?? '?';
  return `${month}/${day}`;
}
