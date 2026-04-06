import { getSupabase } from '@/lib/supabase';
import ReportsClient from './ReportsClient';

export default async function ReportsPage() {
  const supabase = getSupabase();

  // 기수 목록
  const { data: batches } = await supabase
    .from('batches')
    .select('id, name, start_date, end_date')
    .order('start_date', { ascending: false });

  return <ReportsClient batches={batches || []} />;
}
