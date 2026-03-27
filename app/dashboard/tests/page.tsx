import { getSupabase } from '@/lib/supabase';
import TestsClient from './TestsClient';

export const dynamic = 'force-dynamic';

export default async function TestsPage() {
  const supabase = getSupabase();

  const { data: batches } = await supabase
    .from('batches')
    .select('*')
    .order('start_date', { ascending: false });

  const { data: students } = await supabase
    .from('students')
    .select('*')
    .order('name');

  const { data: scores } = await supabase
    .from('test_scores')
    .select('*');

  return (
    <TestsClient
      batches={batches || []}
      students={students || []}
      scores={scores || []}
    />
  );
}
