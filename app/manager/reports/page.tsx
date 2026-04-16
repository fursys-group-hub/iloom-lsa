import { getSupabase } from '@/lib/supabase';
import ManagerReportsClient from './ManagerReportsClient';

export default async function ManagerReportsPage() {
  const supabase = getSupabase();
  const { data: batches } = await supabase
    .from('batches')
    .select('id, name, start_date, end_date')
    .order('start_date', { ascending: false });

  return <ManagerReportsClient batches={batches || []} />;
}
