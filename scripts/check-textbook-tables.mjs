import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const tables = ['textbook_sources', 'textbook_classifications', 'textbook_chapters', 'stores'];
for (const t of tables) {
  const { error, count } = await supabase.from(t).select('*', { count: 'exact', head: true });
  if (error) console.log(`❌ ${t}: ${error.message}`);
  else console.log(`✅ ${t}: ${count}건`);
}
