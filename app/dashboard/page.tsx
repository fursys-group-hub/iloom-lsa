import { getSupabase } from '@/lib/supabase';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = getSupabase();

  const [
    { data: batches },
    { data: students },
    { data: scores },
    { data: attendance },
  ] = await Promise.all([
    supabase.from('batches').select('id').order('start_date', { ascending: false }).limit(1),
    supabase.from('students').select('*').order('name'),
    supabase.from('test_scores').select('*').order('test_date', { ascending: false }).limit(500),
    supabase.from('attendance').select('*'),
  ]);

  return (
    <DashboardClient
      students={students || []}
      scores={scores || []}
      attendance={attendance || []}
      batchId={batches?.[0]?.id}
    />
  );
}
