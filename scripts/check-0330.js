const fs = require('fs');
const path = require('path');
const MD_DIR = path.join(__dirname, '..', '애들 교육일지', '교육일지 마크다운');

// .env.local
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.+)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// import-education-logs.js의 extractStep 복사
function extractStep(content, stepLabel) {
  const stepNum = stepLabel.replace('STEP ', '');
  const headerRegex = new RegExp(`^### *💡? *\[STEP ${stepNum}\]`, 'im');
  const asideRanges = [];
  let sf = 0;
  while (true) {
    const oi = content.indexOf('<aside>', sf);
    if (oi === -1) break;
    const ci = content.indexOf('</aside>', oi);
    if (ci === -1) break;
    asideRanges.push([oi, ci]);
    sf = ci + 8;
  }
  const inAside = (p) => asideRanges.some(([s, e]) => p >= s && p <= e);
  let stepIdx = -1, sp = 0;
  while (true) {
    const m = content.slice(sp).search(headerRegex);
    if (m === -1) break;
    const ap = sp + m;
    if (!inAside(ap)) { stepIdx = ap; break; }
    sp = ap + 10;
  }
  if (stepIdx === -1) return '';
  const afterStep = content.slice(stepIdx);
  const nsm = afterStep.slice(10).search(/\n### *💡?\s*\[STEP/i);
  const section = nsm > 0 ? afterStep.slice(0, nsm + 10) : afterStep;
  const am = [...section.matchAll(/<aside>([\s\S]*?)<\/aside>/g)];
  const sa = am.filter(m => { const t = m[1].trim(); return t && !t.includes('속성 체크') && !t.includes('반가워요'); });
  if (sa.length > 0) return sa[sa.length - 1][1].trim();
  const lines = section.split('\n');
  const cl = lines.filter(l => {
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
  return cl.join('\n').trim();
}

(async () => {
  const files = fs.readdirSync(MD_DIR).filter(f => f.startsWith('2026-03-30') && f.endsWith('.md') && !f.startsWith('교육일지'));

  const { data: dbNotes } = await supabase.from('student_notes').select('id, title, content, students(name)')
    .gte('created_at', '2026-03-30T00:00:00').lt('created_at', '2026-03-31T00:00:00');

  console.log('MD files:', files.length, '| DB notes:', dbNotes.length, '\n');

  const updates = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(MD_DIR, file), 'utf8');
    const titleMatch = file.match(/^2026-03-30\s+(.+?)\s+(?:교육일지|소재|키즈|스터디|리빙|의자)/);
    const name = titleMatch ? titleMatch[1] : null;
    if (!name) { console.log('⏭️ 이름 추출 실패:', file.slice(0, 50)); continue; }

    const mdS1 = extractStep(content, 'STEP 1');
    const mdS2 = extractStep(content, 'STEP 2');
    const mdS3 = extractStep(content, 'STEP 3');

    const dbNote = dbNotes.find(n => n.students?.name === name);
    if (!dbNote) { console.log('❌ DB에 없음:', name, '(file:', file.slice(0, 40), ')'); continue; }

    const p = JSON.parse(dbNote.content);
    const dbS1 = (p.steps?.step1 || '').trim();
    const dbS2 = (p.steps?.step2 || '').trim();
    const dbS3 = (p.steps?.step3 || '').trim();

    // MD에서 더 긴(최신) 내용이 있으면 업데이트 대상
    const needUpdate = mdS1.length > dbS1.length || mdS2.length > dbS2.length || mdS3.length > dbS3.length;
    
    if (needUpdate) {
      console.log('⚠️ 업데이트 필요:', name.padEnd(6),
        '| s1:', dbS1.length, '→', Math.max(mdS1.length, dbS1.length),
        '| s2:', dbS2.length, '→', Math.max(mdS2.length, dbS2.length),
        '| s3:', dbS3.length, '→', Math.max(mdS3.length, dbS3.length));
      
      // 더 긴 쪽 사용
      const newS1 = mdS1.length > dbS1.length ? mdS1 : dbS1;
      const newS2 = mdS2.length > dbS2.length ? mdS2 : dbS2;
      const newS3 = mdS3.length > dbS3.length ? mdS3 : dbS3;

      const lines = content.split('\n');
      const props = {};
      for (const line of lines.slice(0, 20)) {
        const m = line.match(/^(.+?):\s*(.+)$/);
        if (m && !line.startsWith('#') && !line.startsWith('-')) props[m[1].trim()] = m[2].trim();
      }

      updates.push({
        id: dbNote.id,
        name,
        content: JSON.stringify({
          steps: {
            step1: newS1, step2: newS2, step3: newS3,
            step1_completed: props['STEP1'] === 'Yes' || !!newS1,
            step2_completed: props['STEP2'] === 'Yes' || !!newS2,
            step3_completed: props['STEP3'] === 'Yes' || !!newS3,
          },
          meta: {
            tags: props['태그'] ? props['태그'].split(',').map(t => t.trim()).filter(Boolean) : (p.meta?.tags || []),
            confidence: p.meta?.confidence || null,
          },
        }),
      });
    } else {
      console.log('✅ 동일:', name);
    }
  }

  console.log('\n--- 업데이트 실행 ---');
  for (const u of updates) {
    const { error } = await supabase.from('student_notes').update({ content: u.content, updated_at: new Date().toISOString() }).eq('id', u.id);
    if (error) console.log('❌', u.name, ':', error.message);
    else console.log('✅', u.name, '업데이트 완료');
  }
  console.log('\n완료:', updates.length, '건 업데이트');
})();
