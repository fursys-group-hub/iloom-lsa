import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const tables = ['student_notes', 'textbook_classifications', 'questions', 'test_responses'];
for (const t of tables) {
  const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
  if (error) console.log(`${t}: ERROR ${error.message}`);
  else console.log(`${t}: ${count?.toLocaleString() ?? '?'}건`);
}
