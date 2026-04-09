/**
 * 1기 교육 스케줄 초기화 스크립트
 *
 * 1) Supabase에 batches.schedule JSONB 컬럼 추가 (없으면)
 * 2) 1기 스케줄 데이터 저장
 *
 * 실행: node scripts/init-schedule.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 스케줄 범위 정의
// type: education(정규교육), practice(매장실습), off(휴무)
// weekdaysOnly: true이면 해당 범위에서 평일(월~금)만 해당
const SCHEDULE_RANGES = [
  { start: '2026-03-23', end: '2026-04-08', type: 'education', weekdaysOnly: true },  // 월~수
  { start: '2026-04-09', end: '2026-04-10', type: 'off' },       // 목~금 휴무
  { start: '2026-04-11', end: '2026-04-12', type: 'practice' },  // 토~일 매장실습
  { start: '2026-04-13', end: '2026-04-15', type: 'education' }, // 월~수
  { start: '2026-04-16', end: '2026-04-17', type: 'off' },       // 목~금 휴무
  { start: '2026-04-18', end: '2026-04-19', type: 'practice' },  // 토~일 매장실습
  { start: '2026-04-20', end: '2026-04-22', type: 'education' }, // 월~수, 4/22 수료일
];

// 범위 → 개별 날짜 맵 변환 (KST 기준, 타임존 이슈 방지를 위해 문자열로 계산)
function expandSchedule(ranges) {
  const schedule = {};
  for (const range of ranges) {
    // 문자열 기반 날짜 순회 (타임존 이슈 방지)
    let [y, m, dd] = range.start.split('-').map(Number);
    const endStr = range.end;
    while (true) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      if (dateStr > endStr) break;
      // 요일 계산 (UTC noon으로 안전하게)
      const day = new Date(dateStr + 'T12:00:00Z').getUTCDay(); // 0=Sun, 6=Sat
      if (range.weekdaysOnly && (day === 0 || day === 6)) {
        if (!schedule[dateStr]) schedule[dateStr] = 'off';
      } else {
        schedule[dateStr] = range.type;
      }
      // 다음 날
      const next = new Date(Date.UTC(y, m - 1, dd + 1, 12));
      y = next.getUTCFullYear();
      m = next.getUTCMonth() + 1;
      dd = next.getUTCDate();
    }
  }
  return schedule;
}

async function main() {
  // 1) schedule 컬럼 추가 (이미 있으면 무시)
  console.log('1) schedule 컬럼 추가...');
  const { error: alterError } = await supabase.rpc('exec_sql', {
    sql: `ALTER TABLE batches ADD COLUMN IF NOT EXISTS schedule jsonb DEFAULT '{}'::jsonb;`
  }).maybeSingle();

  if (alterError) {
    // rpc가 없을 수 있음 — 직접 SQL 실행 불가 시 수동 안내
    console.log('   ⚠️  RPC로 컬럼 추가 실패 (수동으로 추가해주세요):');
    console.log('   ALTER TABLE batches ADD COLUMN IF NOT EXISTS schedule jsonb DEFAULT \'{}\'::jsonb;');
    console.log('   Supabase 대시보드 → SQL Editor에서 실행');
  } else {
    console.log('   ✅ schedule 컬럼 추가 완료');
  }

  // 2) 1기 배치 찾기
  console.log('\n2) 1기 배치 찾기...');
  const { data: batches, error: fetchError } = await supabase
    .from('batches')
    .select('id, name, start_date')
    .order('start_date', { ascending: true })
    .limit(5);

  if (fetchError) {
    console.error('   ❌ 배치 조회 실패:', fetchError.message);
    return;
  }

  console.log('   배치 목록:');
  batches.forEach(b => console.log(`   - ${b.name} (${b.start_date}) [${b.id}]`));

  // start_date가 2026-03-23인 배치 찾기
  const batch1 = batches.find(b => b.start_date === '2026-03-23') || batches[0];
  if (!batch1) {
    console.error('   ❌ 배치를 찾을 수 없습니다.');
    return;
  }

  console.log(`\n3) "${batch1.name}" 스케줄 저장...`);
  const schedule = expandSchedule(SCHEDULE_RANGES);

  // 날짜별 통계
  const counts = { education: 0, practice: 0, off: 0 };
  Object.values(schedule).forEach(t => counts[t]++);
  console.log(`   정규교육: ${counts.education}일, 매장실습: ${counts.practice}일, 휴무: ${counts.off}일`);

  const { error: updateError } = await supabase
    .from('batches')
    .update({ schedule })
    .eq('id', batch1.id);

  if (updateError) {
    console.error('   ❌ 저장 실패:', updateError.message);
    if (updateError.message.includes('schedule')) {
      console.log('\n   👉 schedule 컬럼이 없는 것 같습니다. Supabase SQL Editor에서 실행해주세요:');
      console.log('   ALTER TABLE batches ADD COLUMN IF NOT EXISTS schedule jsonb DEFAULT \'{}\'::jsonb;');
    }
    return;
  }

  console.log('   ✅ 스케줄 저장 완료!');

  // 확인
  console.log('\n   샘플 데이터:');
  const sample = Object.entries(schedule).slice(0, 10);
  sample.forEach(([date, type]) => console.log(`   ${date}: ${type}`));
  console.log(`   ... 총 ${Object.keys(schedule).length}일`);
}

main().catch(console.error);
