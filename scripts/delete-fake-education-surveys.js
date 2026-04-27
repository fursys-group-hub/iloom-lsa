/**
 * 가라 education_surveys 삭제
 * 사용법:
 *   node scripts/delete-fake-education-surveys.js          # dry-run
 *   node scripts/delete-fake-education-surveys.js --apply  # 삭제
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const apply = process.argv.includes('--apply');

(async () => {
  const { data, error } = await supabase
    .from('education_surveys')
    .select('id, student_id, created_at, students(name)')
    .order('created_at');

  if (error) { console.error('조회 실패:', error); return; }

  console.log(`\n[${apply ? 'APPLY' : 'DRY-RUN'}] education_surveys ${data.length}건 삭제 대상:\n`);
  data.forEach((r, i) => {
    const kst = new Date(r.created_at).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
    console.log(`  ${i + 1}. [${kst}] ${r.students?.name || '?'} (id=${r.id})`);
  });

  if (!apply) {
    console.log('\n실제 삭제는 --apply 플래그 추가.\n');
    return;
  }

  const ids = data.map(r => r.id);
  const { error: delErr } = await supabase.from('education_surveys').delete().in('id', ids);
  if (delErr) console.error('삭제 실패:', delErr);
  else console.log(`\n✅ ${ids.length}건 삭제 완료\n`);
})();
