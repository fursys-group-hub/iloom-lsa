// 시리즈 챕터 HTML을 textbook_chapters에 직접 주입
// 사용법: node scripts/textbook/upsert-chapter.mjs <시리즈명> <html파일경로>

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const seriesName = process.argv[2];
const htmlPath = process.argv[3];

if (!seriesName || !htmlPath) {
  console.error('사용법: node upsert-chapter.mjs <시리즈명> <html파일경로>');
  process.exit(1);
}

const html = await fs.readFile(htmlPath, 'utf-8');

// 카테고리 매핑 (간단)
const categoryMap = {
  '코펜하겐': '리빙', '오브플레인': '리빙', '뉴트': '스터디', '로이': '스터디',
};
const category = categoryMap[seriesName] || null;

const { error } = await supabase
  .from('textbook_chapters')
  .upsert(
    {
      series_name: seriesName,
      category,
      html_content: html,
      status: 'draft',
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'series_name' },
  );

if (error) {
  console.error('❌', error);
  process.exit(1);
}
console.log(`✅ ${seriesName} 챕터 저장 완료 (${html.length}자)`);
