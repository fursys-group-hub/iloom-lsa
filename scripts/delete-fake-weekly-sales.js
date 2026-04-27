/**
 * 가라 weekly_sales 삭제
 * 사용법: node scripts/delete-fake-weekly-sales.js --apply
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
    .from('weekly_sales')
    .select('id, created_at, students(name), week, amount')
    .order('created_at');
  if (error) { console.error(error); return; }

  console.log(`\n[${apply ? 'APPLY' : 'DRY-RUN'}] weekly_sales ${data.length}건 삭제 대상:\n`);
  data.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.students?.name || '?'} week=${r.week} 금액=${r.amount} (id=${r.id})`);
  });

  if (!apply) { console.log('\n실제 삭제는 --apply 추가\n'); return; }

  const ids = data.map(r => r.id);
  const { error: delErr } = await supabase.from('weekly_sales').delete().in('id', ids);
  if (delErr) console.error('삭제 실패:', delErr);
  else console.log(`\n✅ ${ids.length}건 삭제 완료\n`);
})();
