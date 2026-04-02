/**
 * 한국 시간(KST, UTC+9) 기준 날짜 유틸리티
 * Railway 등 UTC 서버에서도 한국 날짜를 정확히 계산
 */

/** KST 기준 오늘 날짜 문자열 (YYYY-MM-DD) */
export function getKSTToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

/** KST 기준 오늘의 시작/끝을 UTC ISO 문자열로 반환 (DB 쿼리용) */
export function getKSTDayRange(dateStr?: string): { start: string; end: string } {
  const date = dateStr || getKSTToday();
  return {
    start: new Date(`${date}T00:00:00+09:00`).toISOString(),
    end: new Date(`${date}T23:59:59.999+09:00`).toISOString(),
  };
}
