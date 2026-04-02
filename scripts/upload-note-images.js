/**
 * 노션 교육일지 마크다운에서 이미지를 추출하여
 * Supabase Storage에 업로드하고, 해당 노트의 step1_images에 추가하는 스크립트
 *
 * 사용법: node scripts/upload-note-images.js
 *   --dry-run  실제 업로드 없이 매칭 결과만 확인
 */

const fs = require('fs');
const path = require('path');

const MD_DIR = path.join(__dirname, '..', '애들 교육일지', '교육일지 마크다운');
const BUCKET = 'note-images';

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

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * 마크다운 파일에서 날짜+이름 추출 (reimport-all-notes.js와 동일 로직)
 */
function parseFileMeta(content, filename) {
  const lines = content.split('\n');
  const props = {};
  for (const line of lines.slice(0, 20)) {
    const match = line.match(/^(.+?):\s*(.+)$/);
    if (match && !line.startsWith('#') && !line.startsWith('-')) {
      props[match[1].trim()] = match[2].trim();
    }
  }

  let date, name;
  const titleMatch = filename.match(/^(\d{4}-\d{2}-\d{2})\s+(.+?)\s+(?:교육일지|소재|키즈|스터디|리빙|의자)/);
  if (titleMatch) {
    date = titleMatch[1];
    name = titleMatch[2];
  } else if (props['계정'] && props['날짜']) {
    name = props['계정'];
    const dateMatch = props['날짜'].match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    if (dateMatch) {
      date = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[3]).padStart(2, '0')}`;
    }
  }

  return { date, name };
}

/**
 * 마크다운에서 이미지 참조 추출: ![alt](filename)
 */
function extractImageRefs(content) {
  const refs = [];
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const imgFile = decodeURIComponent(match[2]);
    // 외부 URL은 건너뛰기
    if (imgFile.startsWith('http://') || imgFile.startsWith('https://')) continue;
    refs.push(imgFile);
  }
  return refs;
}

async function main() {
  console.log(DRY_RUN ? '🔍 DRY RUN 모드 (업로드 없이 매칭만 확인)\n' : '🚀 이미지 업로드 시작\n');

  // 1. 마크다운 파일 목록
  const files = fs.readdirSync(MD_DIR).filter(f => f.endsWith('.md'));
  console.log(`📄 마크다운 파일: ${files.length}개\n`);

  // 2. DB에서 학생 목록 가져오기
  const { data: students } = await supabase.from('students').select('id, name, batch_id');
  if (!students || students.length === 0) {
    console.log('❌ 학생 데이터가 없습니다');
    return;
  }
  const studentMap = new Map();
  students.forEach(s => studentMap.set(s.name, s));

  // 3. 파일별로 처리
  let totalUploaded = 0;
  let totalSkipped = 0;
  let totalNotFound = 0;

  for (const file of files) {
    const content = fs.readFileSync(path.join(MD_DIR, file), 'utf8');
    const { date, name } = parseFileMeta(content, file);

    if (!date || !name) {
      continue; // 날짜/이름 못 찾으면 스킵
    }

    const imageRefs = extractImageRefs(content);
    if (imageRefs.length === 0) continue;

    // 나원빈: 제품별 노션 페이지 사진 → 교육일지 이미지 아님, 제외
    if (name === '나원빈') continue;

    const student = studentMap.get(name);
    if (!student) {
      console.log(`⚠️  학생 "${name}" DB에 없음 → ${imageRefs.length}장 스킵`);
      totalSkipped += imageRefs.length;
      continue;
    }

    // 해당 날짜의 노트 찾기 (KST 기준)
    const dayStart = new Date(`${date}T00:00:00+09:00`).toISOString();
    const dayEnd = new Date(`${date}T23:59:59.999+09:00`).toISOString();
    const { data: notes } = await supabase
      .from('student_notes')
      .select('id, content')
      .eq('student_id', student.id)
      .gte('created_at', dayStart)
      .lt('created_at', dayEnd);

    // 교육일지(자율학습 아닌) 노트 찾기
    const note = notes?.find(n => {
      try {
        const p = JSON.parse(n.content);
        return !(p.meta?.tags || []).includes('자율학습');
      } catch { return true; }
    });

    if (!note) {
      console.log(`⚠️  ${date} ${name} 노트 없음 → ${imageRefs.length}장 스킵`);
      totalNotFound += imageRefs.length;
      continue;
    }

    console.log(`📎 ${date} ${name}: ${imageRefs.length}장 발견`);

    if (DRY_RUN) {
      imageRefs.forEach(img => console.log(`   - ${img}`));
      continue;
    }

    // 이미지 업로드
    const uploadedUrls = [];
    for (const imgFile of imageRefs) {
      const imgPath = path.join(MD_DIR, imgFile);
      if (!fs.existsSync(imgPath)) {
        console.log(`   ❌ 파일 없음: ${imgFile}`);
        continue;
      }

      const ext = path.extname(imgFile).slice(1) || 'png';
      const storagePath = `${student.id}/${date}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const fileBuffer = fs.readFileSync(imgPath);

      // MIME 타입 추정
      const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
      const contentType = mimeMap[ext.toLowerCase()] || 'image/png';

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, fileBuffer, { contentType, upsert: false });

      if (error) {
        console.log(`   ❌ 업로드 실패: ${imgFile} — ${error.message}`);
        continue;
      }

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
      uploadedUrls.push(urlData.publicUrl);
      console.log(`   ✅ ${imgFile}`);
    }

    if (uploadedUrls.length === 0) continue;

    // DB 업데이트: step1_images에 추가
    try {
      const parsed = JSON.parse(note.content);
      let steps;
      if (parsed.steps) {
        steps = parsed.steps;
      } else {
        steps = parsed;
      }

      const existing = steps.step1_images || [];
      steps.step1_images = [...existing, ...uploadedUrls];

      // content 재포장
      const newContent = parsed.steps
        ? JSON.stringify({ ...parsed, steps })
        : JSON.stringify(steps);

      await supabase
        .from('student_notes')
        .update({ content: newContent })
        .eq('id', note.id);

      totalUploaded += uploadedUrls.length;
      console.log(`   💾 DB 업데이트 완료 (${uploadedUrls.length}장)\n`);
    } catch (err) {
      console.log(`   ❌ DB 업데이트 실패: ${err.message}\n`);
    }
  }

  console.log('\n━━━ 완료 ━━━');
  console.log(`✅ 업로드 성공: ${totalUploaded}장`);
  console.log(`⚠️  학생 미매칭: ${totalSkipped}장`);
  console.log(`⚠️  노트 미매칭: ${totalNotFound}장`);
}

main().catch(err => {
  console.error('❌ 에러:', err.message);
  process.exit(1);
});
