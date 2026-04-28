/**
 * 시리즈명 → 대분류 매핑 테이블
 * 일룸 제품 분류 기준 (2026-03 업데이트)
 *
 * 중복 시리즈 우선순위: 스터디 > 서재 > 기타
 * 출처: ../2. 일룸 교육자료 준비/1) 단종품 사양변경 확인/src/series-map.js
 */

export type Category = '키즈' | '서재' | '침실' | '스터디' | '리빙' | '다이닝' | '기타';

export const SERIES_CATEGORY_MAP: Record<string, Category> = {
  // 키즈
  '두들': '키즈',
  '캐빈': '키즈',
  '키니': '키즈',
  '티에드': '키즈',
  '에디키즈': '키즈',
  '팅클팝': '키즈',
  '키즈의자': '키즈',
  '팅클팝B타입': '키즈',

  // 서재
  '글렌': '서재',
  '뉴트 홈오피스': '서재',
  '에디': '서재',
  '모드': '서재',
  '엘바': '서재',
  '케플러 클래식': '서재',

  // 침실
  '바젤 심플리화이트': '침실',
  '바젤 어반월넛': '침실',
  '론다': '침실',
  '아르지안': '침실',
  '어바니': '침실',
  '드로우': '침실',
  '헤이즐R': '침실',
  '그라나다': '침실',
  '반트': '침실',
  '세르크': '침실',
  '미엘': '침실',
  '미엘갤러리': '침실',
  '메이': '침실',
  '쿠시노': '침실',
  '쿠시노코지(아쿠아클린)': '침실',
  '쿠시노코지(실리콘패브릭)': '침실',
  '토스티': '침실',
  '소프토': '침실',
  '그립': '침실',
  '토넷': '침실',
  '통합옷장': '침실',

  // 스터디
  '제롬': '스터디',
  '링키플러스': '스터디',
  '링키S': '스터디',
  '로이': '스터디',
  '로이모노': '스터디',
  '뉴트': '스터디',
  '멘디': '스터디',
  '다나': '스터디',
  '아이핏': '스터디',
  '비토': '스터디',
  '알렉스': '스터디',
  '버튼스위블': '스터디',
  '에가스위블': '스터디',
  '올리버': '스터디',
  '링고아이': '스터디',
  '펑거스': '스터디',

  // 리빙
  '오브': '리빙',
  '오브플레인': '리빙',
  '밴쿠버': '리빙',
  '플로코': '리빙',
  '로쿰': '리빙',
  '무브': '리빙',
  '코펜하겐': '리빙',
  '플롭': '리빙',
  '아떼': '리빙',
  '코모': '리빙',
  '닛': '리빙',
  '스노즈': '리빙',
  '스노즈컴팩트': '리빙',
  '오클랜드': '리빙',
  '베른': '리빙',
  '제네바': '리빙',
  '하노버': '리빙',
  '카이로R': '리빙',
  '베를린': '리빙',
  '멜버른': '리빙',
  '볼케R': '리빙',
  '볼케S': '리빙',
  '스톤': '리빙',
  '어라운드': '리빙',
  '로반': '리빙',
  '엠버': '리빙',
  '파베': '리빙',

  // 다이닝
  '데콘스': '다이닝',
  '레마': '다이닝',
  '로': '다이닝',
  '로플러스': '다이닝',
  '모리니': '다이닝',
  '바테이블': '다이닝',
  '블릭': '다이닝',
  '비비': '다이닝',
  '스트라토': '다이닝',
  '슬릭': '다이닝',
  '시에토스': '다이닝',
  '업모션': '다이닝',
  '엘바패밀리': '다이닝',
  '오노트': '다이닝',
  '플레이트': '다이닝',
  '필즈': '다이닝',
  '토스카노': '다이닝',
};

export const SERIES_LIST: string[] = Object.keys(SERIES_CATEGORY_MAP);

export const CATEGORY_ORDER: Category[] = ['키즈', '서재', '침실', '스터디', '리빙', '다이닝', '기타'];

/** 시리즈명으로 대분류 반환 (없으면 '기타') */
export function getCategoryBySeriesName(seriesName: string): Category {
  if (!seriesName) return '기타';
  if (SERIES_CATEGORY_MAP[seriesName]) return SERIES_CATEGORY_MAP[seriesName];
  for (const [key, val] of Object.entries(SERIES_CATEGORY_MAP)) {
    if (seriesName.includes(key) || key.includes(seriesName)) return val;
  }
  return '기타';
}

/**
 * 텍스트에서 등장하는 시리즈명 직접 추출 (정규식 매칭)
 * - 긴 시리즈명부터 매칭 (예: "로이모노"가 "로이"보다 우선)
 * - 매칭된 부분은 다른 매칭에서 제외해서 중복 방지
 * - 1글자 시리즈명(닛/로)은 단어 경계(공백·구두점·시작·끝)로 둘러싸인 것만 매칭 (오탐 방지)
 */
export function findSeriesInText(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  const sorted = [...SERIES_LIST].sort((a, b) => b.length - a.length);
  let remaining = text;
  // 단어 경계로 인정되는 문자 (한글/영문/숫자가 아닌 것 + 시작/끝)
  const BOUNDARY = `(?:^|[^A-Za-z0-9가-힣])`;
  const BOUNDARY_AFTER = `(?=[^A-Za-z0-9가-힣]|$)`;

  for (const s of sorted) {
    if (s.length === 1) {
      // 1글자: 단어 경계로만 매칭
      const re = new RegExp(`${BOUNDARY}${s}${BOUNDARY_AFTER}`, 'g');
      if (re.test(remaining)) {
        found.add(s);
        remaining = remaining.replace(new RegExp(`${BOUNDARY}${s}${BOUNDARY_AFTER}`, 'g'), (match) => match.replace(s, ' '));
      }
      continue;
    }
    if (remaining.includes(s)) {
      found.add(s);
      remaining = remaining.split(s).join(' '.repeat(s.length));
    }
  }
  return Array.from(found);
}

/** 카테고리별 시리즈 그룹핑 (UI 탭용) */
export function getSeriesByCategory(): Record<Category, string[]> {
  const grouped: Record<Category, string[]> = {
    '키즈': [], '서재': [], '침실': [], '스터디': [], '리빙': [], '다이닝': [], '기타': [],
  };
  for (const [series, cat] of Object.entries(SERIES_CATEGORY_MAP)) {
    grouped[cat].push(series);
  }
  return grouped;
}
