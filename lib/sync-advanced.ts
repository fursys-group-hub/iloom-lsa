import { createServerClient } from '@/lib/supabase';
import { fetchSheetData } from '@/lib/sheets';

export interface AdvancedSyncResult {
  synced: number;
  skipped: number;
  unmatched_names: string[];
  total_rows: number;
  synced_questions?: number;
  questions_note?: string;
}

/**
 * 한글 구글 시트 제출일시 포맷을 ISO로 변환
 * 예: "2026. 4. 23 오후 2:50:56" → "2026-04-23T14:50:56+09:00"
 *    "2026. 4. 13 오전 11:58:53" → "2026-04-13T11:58:53+09:00"
 */
export function parseKoreanTimestamp(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // "2026. 4. 23 오후 2:50:56" 패턴
  const m = trimmed.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\s+(오전|오후)\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  const [, y, mo, d, ampm, hh, mm, ss] = m;
  let hour = parseInt(hh, 10);
  if (ampm === '오후' && hour < 12) hour += 12;
  if (ampm === '오전' && hour === 12) hour = 0;
  const pad = (n: number | string) => String(n).padStart(2, '0');
  // KST(+09:00) 기준 ISO 문자열
  return `${y}-${pad(mo)}-${pad(d)}T${pad(hour)}:${pad(mm)}:${pad(ss)}+09:00`;
}

/**
 * 심화교육 구글 시트 '상세 결과' 탭 → advanced_test_scores 동기화
 *
 * 시트 컬럼 (A~G): 제출일시 / 이름 / 주차 / 회차 / 점수 / 틀린파트 / 제출한답
 *
 * @param batchId 기수 ID (batches.id)
 */
export async function syncAdvancedBatch(batchId: string): Promise<AdvancedSyncResult> {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_SHEETS_API_KEY가 설정되지 않았습니다.');

  const supabase = createServerClient();

  // 1. 기수 조회 → advanced_sheet_id 확인
  const { data: batch, error: batchErr } = await supabase
    .from('batches')
    .select('id, advanced_sheet_id')
    .eq('id', batchId)
    .single();
  if (batchErr || !batch) throw new Error('기수를 찾을 수 없습니다.');
  if (!batch.advanced_sheet_id) {
    throw new Error('이 기수에 심화교육 구글 시트가 설정되지 않았습니다.');
  }

  // 2. 학생 매핑 (이름 → id), 퇴사자 제외
  const { data: students } = await supabase
    .from('students')
    .select('id, name, is_dropped')
    .eq('batch_id', batchId);
  const nameToId = new Map<string, string>();
  for (const s of students || []) {
    if (!s.is_dropped) nameToId.set(s.name.trim(), s.id);
  }

  // 3. 시트 데이터 가져오기 — 탭 이름에 공백이 있으면 작은따옴표로 감싸야 함
  //    '상세 결과' / '상세결과' / '상세_결과' 순서로 시도
  //    빈 컬럼이 섞여도 대응 가능하도록 A:Z로 넓게 읽음
  const tabCandidates = [`'상세 결과'!A:G`, `상세결과!A:G`, `상세_결과!A:G`];
  let rows: string[][] = [];
  let lastErr: unknown = null;
  for (const range of tabCandidates) {
    try {
      rows = await fetchSheetData(batch.advanced_sheet_id, range, apiKey);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) {
    throw new Error(
      `심화교육 시트에서 '상세 결과' 탭을 찾을 수 없습니다. 탭 이름을 확인해주세요. (원인: ${lastErr instanceof Error ? lastErr.message : String(lastErr)})`
    );
  }
  if (rows.length <= 1) {
    return { synced: 0, skipped: 0, unmatched_names: [], total_rows: 0 };
  }

  // 헤더 이름으로 컬럼 인덱스 매핑 (빈 컬럼이 섞여도 안전)
  const header = rows[0];
  const findCol = (keywords: string[]): number => {
    for (let i = 0; i < header.length; i++) {
      const h = (header[i] || '').trim();
      if (keywords.some((k) => h.includes(k))) return i;
    }
    return -1;
  };
  const idxTs = findCol(['제출일시', '타임스탬프', 'timestamp']);
  const idxName = findCol(['이름', '교육생', '성명']);
  const idxWeek = findCol(['주차']);
  const idxAttempt = findCol(['회차', '차수']);
  const idxScore = findCol(['점수']);
  const idxWrong = findCol(['틀린파트', '틀린', '오답']);
  const idxAnswers = findCol(['제출한답', '제출답', '답변']);

  if (idxTs < 0 || idxName < 0 || idxWeek < 0 || idxScore < 0) {
    throw new Error(
      `시트 헤더를 인식할 수 없습니다. 제출일시/이름/주차/점수 컬럼이 필요해요. (찾은 헤더: ${header.join(' | ')})`
    );
  }

  const dataRows = rows.slice(1);
  const unmatched = new Set<string>();
  const batch_inserts: Record<string, unknown>[] = [];

  for (const row of dataRows) {
    const rawTs = row[idxTs] || '';
    const name = (row[idxName] || '').trim();
    const weekRaw = row[idxWeek] || '';
    const attemptRaw = idxAttempt >= 0 ? row[idxAttempt] || '' : '';
    const scoreRaw = row[idxScore] || '';
    const wrongParts = idxWrong >= 0 ? row[idxWrong] || null : null;
    const submittedAnswers = idxAnswers >= 0 ? row[idxAnswers] || null : null;

    if (!rawTs || !name) continue;

    const submitted_at = parseKoreanTimestamp(rawTs);
    if (!submitted_at) continue;

    const studentId = nameToId.get(name);
    if (!studentId) {
      unmatched.add(name);
      continue;
    }

    const week_number = parseInt(weekRaw, 10);
    if (!week_number || week_number < 1 || week_number > 12) continue;

    const score = parseFloat(scoreRaw);
    if (isNaN(score)) continue;

    const sheet_attempt = parseInt(attemptRaw, 10) || null;

    batch_inserts.push({
      student_id: studentId,
      batch_id: batchId,
      week_number,
      sheet_attempt,
      score,
      max_score: 100,
      wrong_parts: wrongParts && wrongParts !== '없음' ? wrongParts : null,
      submitted_answers: submittedAnswers,
      submitted_at,
    });
  }

  // 4. upsert (UNIQUE: student_id + week_number + submitted_at)
  //    .select()를 붙여서 실제 반영된 row id를 받아와 정확한 count 계산
  let synced = 0;
  const skipped = 0;
  for (let i = 0; i < batch_inserts.length; i += 50) {
    const chunk = batch_inserts.slice(i, i + 50);
    const { data: upserted, error } = await supabase
      .from('advanced_test_scores')
      .upsert(chunk, {
        onConflict: 'student_id,week_number,submitted_at',
        ignoreDuplicates: false,
      })
      .select('id');
    if (error) throw error;
    synced += upserted?.length ?? 0;
  }

  // 5. 문제은행 탭 동기화 (있으면 같이 처리 — 없거나 실패해도 점수 동기화는 유지)
  let synced_questions = 0;
  let questions_note: string | undefined;
  try {
    const qTabs = [`'문제은행'!A:Z`, `문제은행!A:Z`];
    let qRows: string[][] = [];
    let qErr: unknown = null;
    for (const range of qTabs) {
      try {
        qRows = await fetchSheetData(batch.advanced_sheet_id, range, apiKey);
        qErr = null;
        break;
      } catch (e) {
        qErr = e;
      }
    }
    if (qErr || qRows.length <= 1) {
      questions_note = '문제은행 탭을 찾지 못했거나 비어있어 건너뛰었어요.';
    } else {
      synced_questions = await syncQuestions(supabase, batchId, qRows);
    }
  } catch (e) {
    questions_note = `문제은행 동기화 중 오류 (무시됨): ${e instanceof Error ? e.message : String(e)}`;
  }

  return {
    synced,
    skipped,
    unmatched_names: Array.from(unmatched),
    total_rows: dataRows.length,
    synced_questions,
    questions_note,
  };
}

/**
 * 문제은행 탭 행을 파싱하여 advanced_questions로 upsert.
 * 헤더 이름으로 컬럼을 유연하게 매핑한다.
 */
async function syncQuestions(
  supabase: ReturnType<typeof createServerClient>,
  batchId: string,
  rows: string[][]
): Promise<number> {
  const header = rows[0];
  const findCol = (keywords: string[]): number => {
    for (let i = 0; i < header.length; i++) {
      const h = (header[i] || '').trim();
      if (keywords.some((k) => h.includes(k))) return i;
    }
    return -1;
  };

  const idxWeek = findCol(['주차']);
  const idxSession = findCol(['회차', '차시']);
  const idxScoringMode = findCol(['유형', '채점']);
  const idxMaxScore = findCol(['배점', '만점']);
  const idxOptions = findCol(['보기', '선택지']);
  const idxText = findCol(['문제내용', '문제', '문항', '지문']);
  const idxAnswer = findCol(['정답']);
  const idxExplanation = findCol(['해설']);
  const idxPart = findCol(['파트', '카테고리']);
  const idxImage = findCol(['이미지', '사진']);

  if (idxWeek < 0 || idxAnswer < 0) {
    // 구조를 인식할 수 없어도 sync는 계속 (빈 결과 반환)
    return 0;
  }

  // 같은 (주차, 회차) 내에서 행 순서대로 문제번호 1,2,3... 부여
  const counterByKey = new Map<string, number>();

  const batch_inserts: Record<string, unknown>[] = [];
  for (const row of rows.slice(1)) {
    const week = parseInt(row[idxWeek] || '', 10);
    if (!week || week < 1 || week > 12) continue;
    const session = idxSession >= 0 ? parseInt(row[idxSession] || '1', 10) || 1 : 1;

    // 문제내용이나 정답 중 하나는 있어야 유효 문제로 간주
    const text = idxText >= 0 ? (row[idxText] || '').trim() : '';
    const answer = (row[idxAnswer] || '').trim();
    if (!text && !answer) continue;

    const key = `${week}-${session}`;
    const next = (counterByKey.get(key) ?? 0) + 1;
    counterByKey.set(key, next);
    const question_id = String(next);

    batch_inserts.push({
      batch_id: batchId,
      week_number: week,
      session,
      question_id,
      question_text: text,
      correct_answer: answer,
      scoring_mode: idxScoringMode >= 0 ? (row[idxScoringMode] || '').trim() : '',
      max_score: idxMaxScore >= 0 ? parseFloat(row[idxMaxScore]) || 1 : 1,
      category: idxPart >= 0 ? row[idxPart] || '' : '',
      series: '',
      detail: '',
      options: idxOptions >= 0 ? row[idxOptions] || '' : '',
      explanation: idxExplanation >= 0 ? row[idxExplanation] || '' : '',
      image_url: idxImage >= 0 ? row[idxImage] || null : null,
      updated_at: new Date().toISOString(),
    });
  }

  let total = 0;
  for (let i = 0; i < batch_inserts.length; i += 50) {
    const chunk = batch_inserts.slice(i, i + 50);
    const { data: upserted, error } = await supabase
      .from('advanced_questions')
      .upsert(chunk, { onConflict: 'batch_id,week_number,session,question_id' })
      .select('id');
    if (error) throw error;
    total += upserted?.length ?? 0;
  }
  return total;
}
