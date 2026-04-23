/**
 * 심화교육 시험 채점·파싱 유틸
 *
 * 제출한답(submitted_answers) 예시:
 *   "1번:O, 2번:X, 11번:600/740, 12번:iv/rm,tm,gy, ..."
 *   값 안에 콤마가 들어갈 수 있어 단순 split은 위험 → "N번:" 기준 정규식으로 분해.
 *
 * 채점 규칙 (사용자 확정):
 *   - OX: 대소문자 무시 완전일치
 *   - 객관식: 숫자 추출 → 집합 비교 (순서 무관)
 *   - 단답식:
 *     · "/" 는 빈칸(슬롯) 구분자 — **순서 유지 필요**
 *     · "," 는 한 슬롯 안의 여러 답 구분자 — **순서 무관**
 *     예) 정답 "1200,1400/WW,RB"
 *         = 슬롯1:{1200,1400}, 슬롯2:{WW,RB}
 *         학생 "1400,1200/RB,WW" → O
 *         학생 "WW,RB/1200,1400" → X (슬롯 순서 바뀜)
 */

export type ScoringMode = 'OX' | '단답식' | '객관식' | string;

/**
 * "1번:O, 2번:X, 11번:18, ..." → { "1": "O", "2": "X", "11": "18", ... }
 * 값 안에 콤마가 있어도 "N번:" 기준으로 안전하게 분리.
 */
export function parseUserAnswers(raw: string | null | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!raw) return result;
  const text = String(raw);

  // N번: 다음 값은 "다음 ',N번:' 가 나올 때까지" 로 lookahead
  const pattern = /(\d+)번\s*:\s*([\s\S]*?)(?=,\s*\d+번\s*:|$)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const key = m[1];
    const value = m[2].replace(/,\s*$/, '').trim();
    result[key] = value;
  }
  return result;
}

/**
 * 단답식 정답/학생답을 슬롯 구조로 정규화
 * - "/" 로 슬롯 분리 (슬롯 순서 유지)
 * - 각 슬롯 내부: 공백 제거 + 대문자 + "," 분리 후 정렬
 * - 결과: "slot1tokens|slot2tokens|..." (| 는 구분용 내부 기호)
 */
function normalizeShortAnswer(s: string): string {
  if (!s) return '';
  const slots = s.split('/');
  return slots
    .map((slot) =>
      slot
        .replace(/\s+/g, '')
        .toUpperCase()
        .split(',')
        .filter((t) => t.length > 0)
        .sort()
        .join(','),
    )
    .join('|');
}

/**
 * 숫자만 추출해서 집합화 (객관식용)
 * "1번, 4번" → "1,4"
 * "1,4"     → "1,4"
 */
function extractNumbers(s: string): string {
  if (!s) return '';
  const nums = s.match(/\d+/g) || [];
  return nums.slice().sort((a, b) => Number(a) - Number(b)).join(',');
}

/**
 * 단일 문항 채점
 * 반환: true(정답) / false(오답) / null(채점 불가 — 답이 없거나 판정 불능)
 */
export function gradeAnswer(
  userAnswer: string | undefined | null,
  correctAnswer: string | undefined | null,
  scoringMode: ScoringMode | undefined | null
): boolean | null {
  const u = (userAnswer || '').trim();
  const c = (correctAnswer || '').trim();
  if (!u && !c) return null;
  if (!u) return false;
  if (!c) return null; // 정답지가 없으면 채점 불가

  const mode = (scoringMode || '').trim();

  // OX
  if (mode === 'OX' || /^O$|^X$/i.test(c)) {
    return u.toUpperCase() === c.toUpperCase();
  }

  // 객관식 (번호 기반)
  if (mode === '객관식' || /번/.test(u)) {
    return extractNumbers(u) === extractNumbers(c);
  }

  // 기본: 단답식 — 슬롯 단위 비교 (슬롯 순서 有, 슬롯 내부 순서 無)
  return normalizeShortAnswer(u) === normalizeShortAnswer(c);
}
