require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // 모든 곽현서 (동명이인 확인)
  const { data: all } = await supabase
    .from('students')
    .select('id, name, batch_id, store_name, department, is_dropped, batches(name)')
    .eq('name', '곽현서');
  console.log(`\n"곽현서" 이름 학생: ${all?.length || 0}명`);
  all?.forEach(s => console.log(`  id=${s.id} batch="${s.batches?.name || '?'}" store=${s.store_name || '-'} dept=${s.department || '-'} dropped=${s.is_dropped}`));

  // 전체 weekly_evaluations (곽현서 없더라도 누가 있는지)
  const { data: allWeekly } = await supabase
    .from('weekly_evaluations')
    .select('id, student_id, week_number, rp_area, status, strength_tags, students(name, batch_id)')
    .order('created_at', { ascending: false })
    .limit(100);
  console.log(`\n전체 weekly_evaluations: ${allWeekly?.length || 0}건`);
  const byStudent = {};
  allWeekly?.forEach(w => {
    const n = w.students?.name || '?';
    byStudent[n] = (byStudent[n] || 0) + 1;
  });
  Object.entries(byStudent).forEach(([n, c]) => console.log(`  ${n}: ${c}건`));

  // 전체 benchmarks
  const { data: allBench } = await supabase
    .from('benchmarks')
    .select('id, student_id, week_number, students(name)')
    .limit(100);
  console.log(`\n전체 benchmarks: ${allBench?.length || 0}건`);
  const benchByStudent = {};
  allBench?.forEach(b => {
    const n = b.students?.name || '?';
    benchByStudent[n] = (benchByStudent[n] || 0) + 1;
  });
  Object.entries(benchByStudent).forEach(([n, c]) => console.log(`  ${n}: ${c}건`));

  // 전체 final_evaluations
  const { data: allFinals } = await supabase
    .from('final_evaluations')
    .select('id, student_id, overall_rating, students(name)')
    .limit(100);
  console.log(`\n전체 final_evaluations: ${allFinals?.length || 0}건`);
  allFinals?.forEach(f => console.log(`  ${f.students?.name || '?'} rating=${f.overall_rating}`));
})();
