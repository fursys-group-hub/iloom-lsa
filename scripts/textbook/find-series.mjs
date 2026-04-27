// PPT 안에서 시리즈명 검색해서 주변 텍스트 보기
// 사용법: node scripts/textbook/find-series.mjs 오브플레인

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const keyword = process.argv[2] || '오브플레인';

const { data, error } = await supabase.from('textbook_sources').select('file_name, full_text');
if (error) { console.error(error); process.exit(1); }

for (const row of data || []) {
  console.log(`\n========================================`);
  console.log(`📄 ${row.file_name}`);
  console.log(`========================================`);
  const text = row.full_text || '';

  // "--- Slide N: title ---" 단위로 분할
  const slides = text.split(/(?=--- Slide \d+)/g).filter(Boolean);
  let hits = 0;
  for (const slide of slides) {
    if (slide.includes(keyword)) {
      hits++;
      console.log(`\n${'─'.repeat(80)}`);
      console.log(slide.slice(0, 1500));
      if (slide.length > 1500) console.log('... (생략)');
    }
  }
  console.log(`\n→ "${keyword}" 매칭 슬라이드: ${hits}장`);
}
