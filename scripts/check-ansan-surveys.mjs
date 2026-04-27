import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: surveys } = await sb
  .from('ansan_tour_surveys')
  .select('*')
  .order('created_at', { ascending: true });

const { data: students } = await sb.from('students').select('id, name, batch_id');
const nameOf = Object.fromEntries(students.map(s => [s.id, s.name]));

const pre = surveys.filter(s => s.phase === 'pre');
const post = surveys.filter(s => s.phase === 'post');

console.log(`\n📊 안성공장 인프라 투어 설문 현황\n${'='.repeat(60)}\n`);
console.log(`✅ 사전 설문: ${pre.length}명`);
console.log(`✅ 사후 설문: ${post.length}명`);

const submittedIds = new Set([...pre, ...post].map(s => s.student_id));
console.log(`\n참여 학생 (${submittedIds.size}명):`);
[...submittedIds].forEach(id => {
  const name = nameOf[id] || '(알 수 없음)';
  const hasPre = pre.some(s => s.student_id === id) ? '✅' : '❌';
  const hasPost = post.some(s => s.student_id === id) ? '✅' : '❌';
  console.log(`  ${name.padEnd(10)} 사전 ${hasPre} / 사후 ${hasPost}`);
});

// 자가진단 평균
const avg = (arr, key) => {
  const nums = arr.map(s => s[key]).filter(n => n != null);
  return nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : '-';
};

const knowKeys = ['know_products', 'know_factory', 'know_sofa', 'know_mattress', 'know_steel', 'know_quality', 'know_competitive', 'know_explain', 'know_value'];
const labels = {
  know_products: '제품 이해', know_factory: '공장 규모', know_sofa: '🛋 소파',
  know_mattress: '🛏 매트리스', know_steel: '🪑 철제', know_quality: '🔍 품질',
  know_competitive: '타사 비교', know_explain: '고객 응대', know_value: '가치 설명',
};

console.log(`\n📈 자가진단 평균 (사전 → 사후 변화)\n${'─'.repeat(60)}`);
knowKeys.forEach(k => {
  const p = avg(pre, k);
  const q = avg(post, k);
  const diff = (p !== '-' && q !== '-') ? (Number(q) - Number(p)).toFixed(2) : '-';
  const arrow = Number(diff) > 0 ? `📈 +${diff}` : Number(diff) < 0 ? `📉 ${diff}` : '➡️';
  console.log(`  ${labels[k].padEnd(14)} ${p} → ${q}   ${arrow}`);
});

if (post.length > 0) {
  console.log(`\n⭐ 사후 만족도 평균\n${'─'.repeat(60)}`);
  ['sat_process', 'sat_helpful', 'sat_guide', 'sat_operation', 'sat_duration'].forEach(k => {
    const lbl = { sat_process: '진행 절차', sat_helpful: '영업 도움', sat_guide: '가이드', sat_operation: '운영(안전/식사)', sat_duration: '시간' }[k];
    console.log(`  ${lbl.padEnd(18)} ${avg(post, k)} / 5`);
  });
  console.log(`  NPS (추천도)        ${avg(post, 'nps')} / 10`);

  const bestCount = {};
  post.forEach(s => { if (s.best_line) bestCount[s.best_line] = (bestCount[s.best_line] || 0) + 1; });
  console.log(`\n🏆 가장 인상 깊었던 라인\n${'─'.repeat(60)}`);
  Object.entries(bestCount).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`  ${k.padEnd(14)} ${v}명`);
  });
}
