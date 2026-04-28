/**
 * 시리즈명 별칭 매핑 — 카탈로그 시리즈명 → 분류 DB의 별칭 키
 *
 * 일지 분류는 series-map.ts(정규식)로 매칭되는데, 카탈로그 표기와 다른 케이스가 있음
 * (예: 카탈로그 '글렌 라이브러리' / 분류 키 '글렌').
 * 카드별 일지 카운트 합산 시 이 매핑을 활용.
 */
export const SERIES_ALIASES: Record<string, string[]> = {
  '글렌 라이브러리': ['글렌'],
  '케플러클래식': ['케플러 클래식'],
  '엘바 패밀리': ['엘바패밀리'],
  '업 모션': ['업모션'],
  '캐빈R': ['캐빈'],
  '멘디R': ['멘디'],
  '뉴트': ['뉴트 홈오피스'],
  '버튼': ['버튼스위블'],
};

/** 시리즈명에 매핑된 모든 별칭 + 자기 자신을 반환 */
export function getAllAliases(seriesName: string): string[] {
  return [seriesName, ...(SERIES_ALIASES[seriesName] || [])];
}
