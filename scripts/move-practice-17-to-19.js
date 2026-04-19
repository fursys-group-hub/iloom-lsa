/**
 * 2026-04-17로 잘못 저장된 실습일지를 2026-04-19로 이동
 *
 * 사용법:
 *   node scripts/move-practice-17-to-19.js          # dry-run (조회만)
 *   node scripts/move-practice-17-to-19.js --apply  # 실제 업데이트
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const apply = process.argv.includes('--apply');

// KST 2026-04-17 = UTC 2026-04-16T15:00:00Z ~ 2026-04-17T14:59:59Z
const FROM_GTE = '2026-04-16T15:00:00.000Z';
const FROM_LT  = '2026-04-17T15:00:00.000Z';
// KST 2026-04-19 12:00 (정오) = UTC 2026-04-19T03:00:00Z
const TO_ISO   = '2026-04-19T03:00:00.000Z';

(async () => {
  const { data, error } = await supabase
    .from('student_notes')
    .select('id, title, content, created_at, student_id, students(name)')
    .ilike('title', '%실습일지%')
    .gte('created_at', FROM_GTE)
    .lt('created_at', FROM_LT)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('조회 실패:', error);
    process.exit(1);
  }

  console.log(`\n[${apply ? 'APPLY' : 'DRY-RUN'}] KST 2026-04-17로 저장된 실습일지: ${data.length}건\n`);
  data.forEach((n, i) => {
    const kst = new Date(n.created_at).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
    console.log(`  ${i + 1}. [${kst}] ${n.students?.name || '?'} — ${n.title}`);
  });

  if (!apply) {
    console.log('\n실제 적용하려면 --apply 플래그를 붙여 다시 실행하세요.\n');
    return;
  }

  if (data.length === 0) {
    console.log('\n이동할 대상이 없습니다.\n');
    return;
  }

  for (const n of data) {
    const newTitle = (n.title || '').replace('2026-04-17', '2026-04-19');
    const { error: updErr } = await supabase
      .from('student_notes')
      .update({ created_at: TO_ISO, title: newTitle })
      .eq('id', n.id);
    if (updErr) {
      console.error(`  ✗ ${n.students?.name} 업데이트 실패:`, updErr.message);
    } else {
      console.log(`  ✓ ${n.students?.name}: ${newTitle}`);
    }
  }

  console.log(`\n✅ ${data.length}건을 2026-04-19 12:00 KST 로 이동했습니다.\n`);
})();
