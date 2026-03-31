/**
 * 노션 임포트 교육일지 재임포트 (3/23~3/30만)
 * 기존 해당 날짜 데이터 삭제 후 다시 임포트
 * 3/31 이후 앱에서 작성한 건 건드리지 않음
 */

const fs = require('fs');
const path = require('path');

const MD_DIR = path.join(__dirname, '..', '애들 교육일지', '교육일지 마크다운');

// .env.local 수동 로드
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.+)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// import-education-logs.js의 extractStep과 동일
function extractStep(content, stepLabel) {
  const stepNum = stepLabel.replace('STEP ', '');
  const headerRegex = new RegExp(`^### *💡? *\\[STEP ${stepNum}\\]`, 'im');
  const asideRanges = [];
  let searchFrom = 0;
  while (true) {
    const openIdx = content.indexOf('<aside>', searchFrom);
    if (openIdx === -1) break;
    const closeIdx = content.indexOf('</aside>', openIdx);
    if (closeIdx === -1) break;
    asideRanges.push([openIdx, closeIdx]);
    searchFrom = closeIdx + 8;
  }
  const isInsideAside = (pos) => asideRanges.some(([s, e]) => pos >= s && pos <= e);
  let stepIdx = -1;
  let searchPos = 0;
  while (true) {
    const match = content.slice(searchPos).search(headerRegex);
    if (match === -1) break;
    const absPos = searchPos + match;
    if (!isInsideAside(absPos)) { stepIdx = absPos; break; }
    searchPos = absPos + 10;
  }
  if (stepIdx === -1) return '';
  const afterStep = content.slice(stepIdx);
  const nextStepMatch = afterStep.slice(10).search(/\n### *💡?\s*\[STEP/i);
  const section = nextStepMatch > 0 ? afterStep.slice(0, nextStepMatch + 10) : afterStep;
  const asideMatches = [...section.matchAll(/<aside>([\s\S]*?)<\/aside>/g)];
  const studentAsides = asideMatches.filter(m => {
    const text = m[1].trim();
    return text && !text.includes('속성 체크') && !text.includes('반가워요');
  });
  if (studentAsides.length > 0) return studentAsides[studentAsides.length - 1][1].trim();
  const lines = section.split('\n');
  const contentLines = lines.filter(l => {
    const t = l.trim();
    if (!t || t === '---') return false;
    if (t.startsWith('###') || t.startsWith('- **📝') || t.startsWith('- **📸') || t.startsWith('- **📍')) return false;
    if (t.startsWith('[](') || t.startsWith('![') || t.startsWith('<aside>') || t.startsWith('</aside>')) return false;
    if (t.includes('왜 기록해야 할까요') || t.includes('고객의 신뢰') || t.includes('미래의 나를 위해')) return false;
    if (t.includes('오늘의 암기 포인트') || t.includes('오늘의 가구 One-Pick') || t.includes('내일의 나에게')) return false;
    if (t.includes('자유로운 학습 기록') || t.includes('현장 스케치')) return false;
    if (t.includes('속성 체크') || t.includes('기록 포인트') || t.includes('무엇을 남길까요')) return false;
    if (t.includes('[태그]') || t.includes('[오늘의 자신감]') || t.includes('자신만만') || t.includes('이해완료') || t.includes('알쏭달쏭') || t.includes('도움요청')) return false;
    if (t.includes('[STEP 1]') || t.includes('[STEP 2') || t.includes('[STEP 3]')) return false;
    return true;
  });
  return contentLines.join('\n').trim();
}

function parseMarkdown(content, filename) {
  const lines = content.split('\n');
  const props = {};
  for (const line of lines.slice(0, 20)) {
    const match = line.match(/^(.+?):\s*(.+)$/);
    if (match && !line.startsWith('#') && !line.startsWith('-')) {
      props[match[1].trim()] = match[2].trim();
    }
  }
  const titleMatch = filename.match(/^(\d{4}-\d{2}-\d{2})\s+(.+?)\s+(?:교육일지|소재|키즈|스터디)/);
  if (!titleMatch) return null;
  const date = titleMatch[1];
  const name = titleMatch[2];

  let confidence = null;
  const confLine = lines.find(l => l.includes('오늘의 자신감'));
  if (confLine) {
    if (confLine.includes('자신만만')) confidence = 'confident';
    else if (confLine.includes('이해완료')) confidence = 'understood';
    else if (confLine.includes('알쏭달쏭')) confidence = 'half';
    else if (confLine.includes('도움요청')) confidence = 'need_help';
  }

  const step1 = extractStep(content, 'STEP 1');
  const step2 = extractStep(content, 'STEP 2');
  const step3 = extractStep(content, 'STEP 3');
  const tags = props['태그'] ? props['태그'].split(',').map(t => t.trim()).filter(Boolean) : [];

  return {
    date, name,
    title: `${date} ${name} / 교육일지`,
    tags, confidence,
    step1_completed: props['STEP1'] === 'Yes',
    step2_completed: props['STEP2'] === 'Yes',
    step3_completed: props['STEP3'] === 'Yes',
    step1_content: step1,
    step2_content: step2,
    step3_content: step3,
  };
}

async function main() {
  console.log('📓 교육일지 재임포트 시작 (3/23~3/30)...\n');

  // 1. 마크다운 파싱
  const files = fs.readdirSync(MD_DIR)
    .filter(f => f.endsWith('.md') && !f.startsWith('교육일지 기본') && /^\d{4}-\d{2}-\d{2}/.test(f));

  const entries = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(MD_DIR, file), 'utf8');
    const parsed = parseMarkdown(content, file);
    if (parsed) entries.push(parsed);
  }
  console.log(`📁 파싱 완료: ${entries.length}개`);

  // 중복 제거
  const deduped = new Map();
  for (const entry of entries) {
    const key = `${entry.date}_${entry.name}`;
    const existing = deduped.get(key);
    if (!existing || (entry.step1_content.length > (existing.step1_content || '').length)) {
      deduped.set(key, entry);
    }
  }
  const finalEntries = [...deduped.values()];
  console.log(`🔄 중복 제거 후: ${finalEntries.length}개`);

  // 2. 학생 매핑
  const { data: students } = await supabase.from('students').select('id, name');
  const studentMap = new Map();
  for (const s of students || []) studentMap.set(s.name, s.id);
  console.log(`👥 DB 학생 ${studentMap.size}명 매핑`);

  // 3. 기존 3/23~3/30 데이터 삭제
  const { data: oldNotes, error: fetchErr } = await supabase
    .from('student_notes')
    .select('id, created_at')
    .gte('created_at', '2026-03-23T00:00:00')
    .lt('created_at', '2026-03-31T00:00:00');

  if (fetchErr) { console.log('❌ 조회 실패:', fetchErr.message); return; }
  console.log(`🗑️ 삭제 대상: ${oldNotes.length}건 (3/23~3/30)`);

  if (oldNotes.length > 0) {
    const ids = oldNotes.map(n => n.id);
    const { error: delErr } = await supabase
      .from('student_notes')
      .delete()
      .in('id', ids);
    if (delErr) { console.log('❌ 삭제 실패:', delErr.message); return; }
    console.log(`✅ ${ids.length}건 삭제 완료`);
  }

  // 4. 재임포트
  let success = 0, skipped = 0;
  for (const entry of finalEntries) {
    const studentId = studentMap.get(entry.name);
    if (!studentId) {
      console.log(`  ⚠️ 학생 미매칭: ${entry.name}`);
      skipped++;
      continue;
    }

    const contentObj = JSON.stringify({
      steps: {
        step1: entry.step1_content,
        step2: entry.step2_content,
        step3: entry.step3_content,
        step1_completed: entry.step1_completed,
        step2_completed: entry.step2_completed,
        step3_completed: entry.step3_completed,
      },
      meta: {
        tags: entry.tags,
        confidence: entry.confidence,
      },
    });

    const { error } = await supabase
      .from('student_notes')
      .insert({
        student_id: studentId,
        title: entry.title,
        content: contentObj,
        created_at: `${entry.date}T09:00:00+09:00`,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.log(`  ❌ ${entry.date} ${entry.name}: ${error.message}`);
      skipped++;
    } else {
      success++;
    }
  }

  console.log(`\n🎉 재임포트 완료! 성공: ${success}건, 스킵: ${skipped}건`);
}

main().catch(console.error);
