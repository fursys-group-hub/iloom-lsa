import { createServerClient } from '@/lib/supabase';
import { fetchSheetData, parseResultRows } from '@/lib/sheets';
import { getKSTToday } from '@/lib/date';

export interface SyncResult {
  message: string;
  syncedQuestions: number;
  syncedStudents: number;
  syncedScores: number;
  syncedResponses: number;
  skippedScores: number;
  skippedResponses: number;
}

function formatDate(dateStr: string): string {
  const parts = dateStr.split(/[-/]/);
  return parts.length === 3
    ? `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
    : dateStr;
}

/**
 * Google Sheets → Supabase 동기화 핵심 로직
 * @param sheetId Google Sheets ID
 * @param date 'today' | 'YYYY-MM-DD' | null(전체)
 * @param mode 'full'(덮어쓰기) | 'new_only'(새 응답만)
 */
export async function syncBatch(
  sheetId: string,
  date: string | null,
  mode: 'full' | 'new_only' = 'full'
): Promise<SyncResult> {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_SHEETS_API_KEY가 설정되지 않았습니다.');

  const supabase = createServerClient();

  // 1. Google Sheets 3탭 동시 가져오기
  const [questionRows, resultRows, detailRows] = await Promise.all([
    fetchSheetData(sheetId, '문제은행!A:N', apiKey),
    fetchSheetData(sheetId, '결과_DB!A:H', apiKey),
    fetchSheetData(sheetId, '상세_로그!A:L', apiKey),
  ]);

  // 날짜 필터 적용
  const filterDate = date === 'today'
    ? getKSTToday()
    : date || null;

  const filterByDate = (rows: string[][], headerRow: boolean = true): string[][] => {
    if (!filterDate) return rows;
    const header = headerRow ? [rows[0]] : [];
    const data = headerRow ? rows.slice(1) : rows;
    const filtered = data.filter((row) => {
      const timestamp = row[0] || '';
      return timestamp.startsWith(filterDate);
    });
    return [...header, ...filtered];
  };

  const filteredResultRows = filterByDate(resultRows);
  const filteredDetailRows = filterByDate(detailRows);
  const results = parseResultRows(filteredResultRows);
  const dateLabel = filterDate || '전체';

  // 2. 기수 확인/생성
  const { data: batch } = await supabase
    .from('batches').select('id').eq('sheet_id', sheetId).single();

  let batchId: string;
  if (batch) {
    batchId = batch.id;
  } else {
    const { data: newBatch } = await supabase
      .from('batches')
      .insert({
        name: '신입 교육',
        start_date: getKSTToday(),
        end_date: getKSTToday(),
        sheet_id: sheetId, subject_columns: {},
      })
      .select('id').single();
    if (!newBatch) throw new Error('기수 생성 실패');
    batchId = newBatch.id;
  }

  // 3. 문제은행 → questions
  const questionBatch: Record<string, unknown>[] = [];
  for (const row of questionRows.slice(1)) {
    const session = row[0] || '';
    const num = row[1] || '';
    const subId = row[2] || '';
    const questionId = subId ? `${num}-${subId}` : num;
    if (!session || !questionId) continue;

    questionBatch.push({
      batch_id: batchId, session, question_id: questionId,
      question_text: row[7] || row[6] || '',
      correct_answer: row[9] || '',
      scoring_mode: row[10] || '',
      max_score: parseFloat(row[11]) || 1,
      category: row[3] || '', series: row[4] || '', detail: row[5] || '',
      options: row[8] || '', explanation: row[12] || '', image_url: row[13] || null,
      updated_at: new Date().toISOString(),
    });
  }
  for (let i = 0; i < questionBatch.length; i += 50) {
    await supabase.from('questions')
      .upsert(questionBatch.slice(i, i + 50), { onConflict: 'batch_id,session,question_id' });
  }

  // 4. 학생 upsert
  const studentNames = [...new Set(results.map((r) => r.name))];
  const studentMap = new Map<string, string>();
  for (const name of studentNames) {
    const { data: student } = await supabase
      .from('students')
      .upsert({ batch_id: batchId, name, department: null }, { onConflict: 'batch_id,name' })
      .select('id').single();
    if (student) studentMap.set(name, student.id);
  }

  // 5. 점수 배치 upsert
  const scoreBatch: Record<string, unknown>[] = [];
  for (const result of results) {
    const studentId = studentMap.get(result.name);
    if (!studentId) continue;
    const testDate = formatDate(result.timestamp.split(' ')[0]);
    scoreBatch.push({
      student_id: studentId, test_date: testDate,
      subject: result.session, score: result.score_100, max_score: 100,
    });
  }

  let skippedScores = 0;
  let skippedResponses = 0;

  if (mode === 'new_only') {
    for (const item of scoreBatch) {
      const { data: existing } = await supabase.from('test_scores')
        .select('id').eq('student_id', item.student_id).eq('test_date', item.test_date).eq('subject', item.subject).single();
      if (existing) { skippedScores++; continue; }
      await supabase.from('test_scores').insert(item);
    }
  } else {
    for (let i = 0; i < scoreBatch.length; i += 50) {
      await supabase.from('test_scores')
        .upsert(scoreBatch.slice(i, i + 50), { onConflict: 'student_id,test_date,subject' });
    }
  }

  // 6. 상세_로그 → test_responses
  const respBatch: Record<string, unknown>[] = [];
  for (const row of filteredDetailRows.slice(1)) {
    const name = row[2] || '';
    const studentId = studentMap.get(name);
    if (!studentId) continue;

    const session = row[1] || '';
    const questionId = row[3] || '';
    if (!session || !questionId) continue;

    const testDate = formatDate((row[0] || '').split(' ')[0]);
    const isCorrect = row[7] === 'O';
    const maxScore = parseFloat(row[9]) || 1;
    let earnedScore = parseFloat(row[8]) || 0;
    if (isCorrect && earnedScore === 0) earnedScore = maxScore;

    respBatch.push({
      student_id: studentId, batch_id: batchId,
      session, question_id: questionId, test_date: testDate,
      user_answer: row[5] || '', is_correct: isCorrect,
      earned_score: earnedScore, max_score: maxScore,
      scoring_mode: row[10] || '', submitted_at: row[0] || '',
    });
  }

  if (mode === 'new_only') {
    for (const item of respBatch) {
      const { data: existing } = await supabase.from('test_responses')
        .select('id').eq('student_id', item.student_id).eq('session', item.session)
        .eq('question_id', item.question_id).eq('test_date', item.test_date).single();
      if (existing) { skippedResponses++; continue; }
      await supabase.from('test_responses').insert(item);
    }
  } else {
    for (let i = 0; i < respBatch.length; i += 100) {
      await supabase.from('test_responses')
        .upsert(respBatch.slice(i, i + 100), { onConflict: 'student_id,session,question_id,test_date' });
    }
  }

  const modeLabel = mode === 'new_only' ? '새 응답만' : '전체';
  const skipMsg = mode === 'new_only' ? ` (기존 건너뜀: 점수 ${skippedScores}건, 응답 ${skippedResponses}건)` : '';

  return {
    message: `동기화 완료! (${dateLabel}, ${modeLabel}) 문제 ${questionBatch.length}개, 학생 ${studentMap.size}명, 점수 ${scoreBatch.length - skippedScores}건, 응답 ${respBatch.length - skippedResponses}건${skipMsg}`,
    syncedQuestions: questionBatch.length,
    syncedStudents: studentMap.size,
    syncedScores: scoreBatch.length - skippedScores,
    syncedResponses: respBatch.length - skippedResponses,
    skippedScores,
    skippedResponses,
  };
}
