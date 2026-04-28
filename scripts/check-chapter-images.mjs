import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data } = await supabase.from('textbook_chapters').select('series_name, html_content');
for (const c of data || []) {
  const matches = (c.html_content || '').match(/<img[^>]+src=["']([^"']+)["']/g) || [];
  console.log(`\n[${c.series_name}] 이미지 ${matches.length}개`);
  const samples = matches.slice(0, 3).map(m => m.match(/src=["']([^"']+)["']/)[1]);
  samples.forEach(s => console.log('  →', s));
}
