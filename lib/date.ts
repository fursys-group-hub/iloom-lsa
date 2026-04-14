/**
 * 한국 시간(KST, UTC+9) 기준 날짜 유틸리티
 * Railway 등 UTC 서버에서도 한국 날짜를 정확히 계산
 */

/** KST 기준 오늘 날짜 문자열 (YYYY-MM-DD) */
export function getKSTToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

/** KST 기준 어제 날짜 문자열 (YYYY-MM-DD) */
export function getKSTYesterday(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('sv-SE');
}

/** Date 객체 또는 ISO 문자열을 KST 기준 YYYY-MM-DD로 변환 */
export function toKSTDateString(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

/** Date 객체 또는 ISO 문자열을 KST 기준 M/D (예: 4/14) 형식으로 변환 */
export function formatKSTShortDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const m = Number(d.toLocaleDateString('en-US', { timeZone: 'Asia/Seoul', month: 'numeric' }));
  const day = Number(d.toLocaleDateString('en-US', { timeZone: 'Asia/Seoul', day: 'numeric' }));
  return `${m}/${day}`;
}

/** Date 객체 또는 ISO 문자열을 KST 기준 한국어 날짜로 변환 (예: 2026. 4. 14.) */
export function formatKSTDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', ...options });
}

/** KST 기준 오늘의 시작/끝을 UTC ISO 문자열로 반환 (DB 쿼리용) */
export function getKSTDayRange(dateStr?: string): { start: string; end: string } {
  const date = dateStr || getKSTToday();
  return {
    start: new Date(`${date}T00:00:00+09:00`).toISOString(),
    end: new Date(`${date}T23:59:59.999+09:00`).toISOString(),
  };
}
