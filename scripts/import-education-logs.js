/**
 * 노션 교육일지 마크다운 → Supabase DB 임포트 스크립트
 * 사용법: node scripts/import-education-logs.js
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

function extractStep(content, stepLabel) {
  const stepRegex = new RegExp(`###.*\\[${stepLabel}\\]`, 'i');
  const stepIdx = content.search(stepRegex);
  if (stepIdx === -1) return '';

  const afterStep = content.slice(stepIdx);
  // 다음 --- 또는 ### 까지
  const endIdx = afterStep.indexOf('\n---', 10);
  const section = endIdx > 0 ? afterStep.slice(0, endIdx) : afterStep;

  // <aside> 블록들 추출
  const asideMatches = [...section.matchAll(/<aside>([\s\S]*?)<\/aside>/g)];
  if (asideMatches.length === 0) return '';

  // 마지막 aside가 학생이 작성한 실제 내용
  return asideMatches[asideMatches.length - 1][1].trim();
}

function parseMarkdown(content, filename) {
  const lines = content.split('\n');

  // 속성 추출
  const props = {};
  for (const line of lines.slice(0, 20)) {
    const match = line.match(/^(.+?):\s*(.+)$/);
    if (match && !line.startsWith('#') && !line.startsWith('-')) {
      props[match[1].trim()] = match[2].trim();
    }
  }

  // 파일명에서 날짜, 이름 추출
  const titleMatch = filename.match(/^(\d{4}-\d{2}-\d{2})\s+(.+?)\s+(?:교육일지|소재|키즈|스터디)/);
  if (!titleMatch) return null;
  const date = titleMatch[1];
  const name = titleMatch[2];

  // 자신감
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
    title: lines[0]?.replace(/^#\s*/, '') || `${date} ${name} / 교육일지`,
    tags, confidence,
    step1_completed: props['STEP1'] === 'Yes',
    step2_completed: props['STEP2'] === 'Yes',
    step3_completed: props['STEP3'] === 'Yes',
    participation_score: parseInt(props['참여점수']) || 0,
    best_learning: props['베스트학습'] === 'Yes',
    one_word: props['오늘 한마디!'] || null,
    step1_content: step1,
    step2_content: step2,
    step3_content: step3,
  };
}

async function main() {
  console.log('📓 교육일지 임포트 시작...\n');

  const files = fs.readdirSync(MD_DIR)
    .filter(f => f.endsWith('.md') && !f.startsWith('교육일지 기본') && /^\d{4}-\d{2}-\d{2}/.test(f));

  console.log(`📁 마크다운 파일 ${files.length}개 발견`);

  const entries = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(MD_DIR, file), 'utf8');
    const parsed = parseMarkdown(content, file);
    if (parsed) entries.push(parsed);
  }
  console.log(`✅ 파싱 완료: ${entries.length}개`);

  // 중복 제거 (같은 학생+같은 날짜 → 참여점수 높은 것)
  const deduped = new Map();
  for (const entry of entries) {
    const key = `${entry.date}_${entry.name}`;
    const existing = deduped.get(key);
    if (!existing || entry.participation_score > existing.participation_score) {
      deduped.set(key, entry);
    }
  }
  const finalEntries = [...deduped.values()];
  console.log(`🔄 중복 제거 후: ${finalEntries.length}개`);

  // 학생 매핑
  const { data: students } = await supabase.from('students').select('id, name');
  const studentMap = new Map();
  for (const s of students || []) studentMap.set(s.name, s.id);
  console.log(`👥 DB 학생 ${studentMap.size}명 매핑\n`);

  // DB insert (기존 데이터 없으므로 insert)
  let success = 0, skipped = 0;

  for (const entry of finalEntries) {
    const studentId = studentMap.get(entry.name);
    if (!studentId) {
      console.log(`  ⚠️ 학생 미매칭: ${entry.name}`);
      skipped++;
      continue;
    }

    // content를 기존 API의 pack 형식에 맞춤
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
        participation_score: entry.participation_score,
        best_learning: entry.best_learning,
        one_word: entry.one_word,
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

  console.log(`\n🎉 임포트 완료! 성공: ${success}건, 스킵: ${skipped}건`);
}

main().catch(console.error);
