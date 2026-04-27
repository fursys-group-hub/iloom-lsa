require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // 전체 coaching_reports 조회
  const { data: reports } = await supabase
    .from('coaching_reports')
    .select('id, student_id, report_type, subject, test_date, created_at, students(name)')
    .order('created_at', { ascending: false });

  console.log(`\n전체 coaching_reports: ${reports?.length || 0}건\n`);
  reports?.forEach(r => {
    const kst = new Date(r.created_at).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
    console.log(`  [${kst}] ${r.students?.name || '?'} — ${r.report_type}/${r.subject || '-'} test_date=${r.test_date} (id=${r.id})`);
  });
})();
