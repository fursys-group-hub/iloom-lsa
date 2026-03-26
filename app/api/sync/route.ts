import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { fetchSheetData, parseResultRows, parseWrongNote, mapQuestionToTags } from '@/lib/sheets';

export async function POST(req: NextRequest) {
  try {
    const { sheetId } = await req.json();
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;

    if (!apiKey) {
      return Response.json(
        { message: 'GOOGLE_SHEETS_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    if (!sheetId) {
      return Response.json(
        { message: 'sheetId가 필요합니다.' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // 1. 문제은행 가져오기
    const questionRows = await fetchSheetData(sheetId, '문제은행!A:N', apiKey);

    // 2. 결과_DB 가져오기
    const resultRows = await fetchSheetData(sheetId, '결과_DB!A:H', apiKey);
    const results = parseResultRows(resultRows);

    let syncedStudents = 0;
    let syncedScores = 0;
    let syncedWrongAnswers = 0;

    // 3. 기수 확인/생성
    const { data: batch } = await supabase
      .from('batches')
      .select('id')
      .eq('sheet_id', sheetId)
      .single();

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
          sheet_id: sheetId,
          subject_columns: {},
        })
        .select('id')
        .single();

      if (!newBatch) {
        return Response.json({ message: '기수 생성 실패' }, { status: 500 });
      }
      batchId = newBatch.id;
    }

    // 4. 학생별로 처리
    const studentNames = [...new Set(results.map((r) => r.name))];

    for (const name of studentNames) {
      // 학생 upsert
      const { data: student } = await supabase
        .from('students')
        .upsert(
          { batch_id: batchId, name, department: null },
          { onConflict: 'batch_id,name' }
        )
        .select('id')
        .single();

      if (!student) continue;
      syncedStudents++;

      // 해당 학생의 결과들
      const studentResults = results.filter((r) => r.name === name);

      for (const result of studentResults) {
        const testDate = result.timestamp.split(' ')[0];
        // YYYY-MM-DD 형식으로 변환
        const dateParts = testDate.split(/[-/]/);
        const formattedDate =
          dateParts.length === 3
            ? `${dateParts[0]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`
            : testDate;

        // 점수 upsert
        await supabase.from('test_scores').upsert(
          {
            student_id: student.id,
            test_date: formattedDate,
            subject: result.session,
            score: result.score_100,
            max_score: 100,
          },
          { onConflict: 'student_id,test_date,subject' }
        );
        syncedScores++;

        // 오답 파싱 + 저장
        const wrongAnswers = parseWrongNote(result.wrong_note);
        for (const wa of wrongAnswers) {
          const tags = mapQuestionToTags(
            wa.question_number,
            result.session,
            questionRows.slice(1) // 헤더 제외
          );

          if (tags.length > 0) {
            await supabase.from('wrong_answers').insert({
              student_id: student.id,
              test_date: formattedDate,
              subject: result.session,
              question_summary: wa.question_text.slice(0, 200),
              tags,
            });
            syncedWrongAnswers++;
          }
        }
      }
    }

    return Response.json({
      message: `동기화 완료! 학생 ${syncedStudents}명, 점수 ${syncedScores}건, 오답 ${syncedWrongAnswers}건`,
      syncedStudents,
      syncedScores,
      syncedWrongAnswers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return Response.json({ message: `동기화 실패: ${message}` }, { status: 500 });
  }
}
