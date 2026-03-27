import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { fetchSheetData, parseResultRows } from '@/lib/sheets';

export async function POST(req: NextRequest) {
  try {
    const { sheetId } = await req.json();
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;

    if (!apiKey) {
      return Response.json({ message: 'GOOGLE_SHEETS_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }
    if (!sheetId) {
      return Response.json({ message: 'sheetId가 필요합니다.' }, { status: 400 });
    }

    const supabase = createServerClient();

    // 1. Google Sheets 3탭 동시 가져오기
    const [questionRows, resultRows, detailRows] = await Promise.all([
      fetchSheetData(sheetId, '문제은행!A:N', apiKey),
      fetchSheetData(sheetId, '결과_DB!A:H', apiKey),
      fetchSheetData(sheetId, '상세_로그!A:L', apiKey),
    ]);

    const results = parseResultRows(resultRows);

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
          start_date: new Date().toISOString().split('T')[0],
          end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          sheet_id: sheetId, subject_columns: {},
        })
        .select('id').single();
      if (!newBatch) return Response.json({ message: '기수 생성 실패' }, { status: 500 });
      batchId = newBatch.id;
    }

    // 3. 문제은행 → questions (배치 upsert, 50개씩)
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
    // 50개씩 배치 upsert
    for (let i = 0; i < questionBatch.length; i += 50) {
      await supabase.from('questions')
        .upsert(questionBatch.slice(i, i + 50), { onConflict: 'batch_id,session,question_id' });
    }

    // 4. 학생 upsert (한번에)
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
    for (let i = 0; i < scoreBatch.length; i += 50) {
      await supabase.from('test_scores')
        .upsert(scoreBatch.slice(i, i + 50), { onConflict: 'student_id,test_date,subject' });
    }

    // 6. 상세_로그 → test_responses (배치 upsert, 100개씩)
    const respBatch: Record<string, unknown>[] = [];
    for (const row of detailRows.slice(1)) {
      const name = row[2] || '';
      const studentId = studentMap.get(name);
      if (!studentId) continue;

      const session = row[1] || '';
      const questionId = row[3] || '';
      if (!session || !questionId) continue;

      const testDate = formatDate((row[0] || '').split(' ')[0]);

      respBatch.push({
        student_id: studentId, batch_id: batchId,
        session, question_id: questionId, test_date: testDate,
        user_answer: row[5] || '', is_correct: row[7] === 'O',
        earned_score: parseFloat(row[8]) || 0,
        max_score: parseFloat(row[9]) || 1,
        scoring_mode: row[10] || '',
        submitted_at: row[0] || '',
      });
    }
    for (let i = 0; i < respBatch.length; i += 100) {
      await supabase.from('test_responses')
        .upsert(respBatch.slice(i, i + 100), { onConflict: 'student_id,session,question_id,test_date' });
    }

    return Response.json({
      message: `동기화 완료! 문제 ${questionBatch.length}개, 학생 ${studentMap.size}명, 점수 ${scoreBatch.length}건, 응답 ${respBatch.length}건`,
      syncedQuestions: questionBatch.length,
      syncedStudents: studentMap.size,
      syncedScores: scoreBatch.length,
      syncedResponses: respBatch.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return Response.json({ message: `동기화 실패: ${message}` }, { status: 500 });
  }
}

function formatDate(dateStr: string): string {
  const parts = dateStr.split(/[-/]/);
  return parts.length === 3
    ? `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
    : dateStr;
}
