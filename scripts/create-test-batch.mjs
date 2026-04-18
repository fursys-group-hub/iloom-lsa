// 테스트 기수 생성 (기수간 비교 UI 확인용)
// 실행: node scripts/create-test-batch.mjs
// 삭제: node scripts/create-test-batch.mjs --delete
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TEST_BATCH_NAME = '테스트 기수 (삭제해도 됨)';
const FAKE_STUDENTS = ['테스트1', '테스트2', '테스트3', '테스트4', '테스트5'];

const mode = process.argv.includes('--delete') ? 'delete' : 'create';

async function deleteTestBatch() {
  const { data: batch } = await sb.from('batches').select('id').eq('name', TEST_BATCH_NAME).maybeSingle();
  if (!batch) { console.log('삭제할 테스트 기수 없음'); return; }
  const { data: students } = await sb.from('students').select('id').eq('batch_id', batch.id);
  const studentIds = (students || []).map(s => s.id);
  if (studentIds.length) {
    await sb.from('test_responses').delete().in('student_id', studentIds);
    await sb.from('test_scores').delete().in('student_id', studentIds);
    await sb.from('students').delete().in('id', studentIds);
  }
  await sb.from('batches').delete().eq('id', batch.id);
  console.log(`✅ 테스트 기수 삭제 완료 (학생 ${studentIds.length}명 포함)`);
}

async function createTestBatch() {
  // 중복 체크
  const { data: existing } = await sb.from('batches').select('id').eq('name', TEST_BATCH_NAME).maybeSingle();
  if (existing) { console.log('이미 테스트 기수가 있어요. --delete 로 먼저 삭제하세요.'); return; }

  // 1. 배치 생성 (한 달 앞당겨서)
  const { data: currentBatch } = await sb.from('batches').select('*').order('start_date', { ascending: false }).limit(1).single();
  if (!currentBatch) { console.log('기준 기수 없음'); return; }

  const shiftDays = 60; // 2달 전
  const shiftDate = (s) => { const d = new Date(s); d.setDate(d.getDate() - shiftDays); return d.toISOString().slice(0, 10); };

  const { data: batch, error: bErr } = await sb.from('batches').insert({
    name: TEST_BATCH_NAME,
    start_date: shiftDate(currentBatch.start_date),
    end_date: shiftDate(currentBatch.end_date),
    advanced_start: currentBatch.advanced_start ? shiftDate(currentBatch.advanced_start) : null,
    advanced_end: currentBatch.advanced_end ? shiftDate(currentBatch.advanced_end) : null,
    subject_columns: currentBatch.subject_columns || {},
    is_archived: false,
  }).select().single();
  if (bErr) { console.error('기수 생성 실패:', bErr); return; }
  console.log(`✅ 기수 생성: ${batch.name} (${batch.id})`);

  // 2. 학생 생성
  const studentRows = FAKE_STUDENTS.map(name => ({ name, batch_id: batch.id, password: '0000', is_dropped: false }));
  const { data: students, error: sErr } = await sb.from('students').insert(studentRows).select();
  if (sErr) { console.error('학생 생성 실패:', sErr); return; }
  console.log(`✅ 학생 생성: ${students.length}명`);

  // 3. 현재 기수의 시험 점수/응답 가져와서 유사 패턴으로 복제 (점수는 평균 -8점 정도로 낮춰서 확인 용이)
  // test_scores는 batch_id 컬럼이 없어서 students로 조인
  const { data: currStudents } = await sb.from('students').select('id').eq('batch_id', currentBatch.id);
  const currStudentIds = (currStudents || []).map(s => s.id);
  const { data: currScores } = currStudentIds.length
    ? await sb.from('test_scores').select('*').in('student_id', currStudentIds).limit(500)
    : { data: [] };
  const { data: currResponses } = await sb.from('test_responses').select('*').eq('batch_id', currentBatch.id).limit(2000);

  // 차시별 통계 뽑기
  const subjects = [...new Set((currScores || []).map(s => s.subject))].sort();
  const dates = [...new Set((currScores || []).map(s => s.test_date))].sort();

  // 4. test_scores: 각 학생 × 각 차시, 기존 평균보다 ~8점 높게 (이전 기수가 더 잘했다는 느낌 → 현재 기수 비교에서 하락 표시)
  const scoreRows = [];
  for (const student of students) {
    for (let i = 0; i < subjects.length; i++) {
      const subject = subjects[i];
      const date = dates[i] || dates[dates.length - 1];
      const baseScore = 70 + Math.random() * 20; // 70~90점
      scoreRows.push({
        student_id: student.id,
        test_date: shiftDate(date),
        subject,
        score: Math.round(baseScore * 10) / 10,
        max_score: 100,
      });
    }
  }
  // test_scores upsert
  for (let i = 0; i < scoreRows.length; i += 50) {
    const { error } = await sb.from('test_scores').insert(scoreRows.slice(i, i + 50));
    if (error) console.error('점수 삽입 실패:', error.message);
  }
  console.log(`✅ 시험 점수 생성: ${scoreRows.length}건`);

  // 5. test_responses: 각 학생 × 각 문항 (카테고리 비교를 위해)
  const qMap = new Map();
  for (const r of currResponses || []) qMap.set(`${r.session}_${r.question_id}`, r);
  const uniqueQuestions = [...qMap.values()];

  const respRows = [];
  for (const student of students) {
    for (const q of uniqueQuestions.slice(0, 150)) { // 문항당 학생 5명 × 150문항 = 750건
      const isCorrect = Math.random() < 0.75; // 정답률 75% (현재 기수보다 높게)
      respRows.push({
        student_id: student.id,
        batch_id: batch.id,
        session: q.session,
        question_id: q.question_id,
        test_date: shiftDate(q.test_date),
        user_answer: isCorrect ? (q.user_answer || '') : '1',
        is_correct: isCorrect,
        earned_score: isCorrect ? 1 : 0,
        max_score: 1,
        scoring_mode: q.scoring_mode || '',
        submitted_at: q.submitted_at || '',
      });
    }
  }
  for (let i = 0; i < respRows.length; i += 100) {
    const { error } = await sb.from('test_responses').insert(respRows.slice(i, i + 100));
    if (error) console.error('응답 삽입 실패:', error.message);
  }
  console.log(`✅ 시험 응답 생성: ${respRows.length}건`);

  console.log(`\n🎉 완료! 브라우저 새로고침 후 시험 분석 탭에서 "🏁 기수간 비교" 카드 확인하세요.`);
  console.log(`\n삭제하려면: node scripts/create-test-batch.mjs --delete`);
}

if (mode === 'delete') await deleteTestBatch();
else await createTestBatch();
