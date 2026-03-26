import { getSupabase } from '@/lib/supabase';
import StudentsClient from './StudentsClient';

export const dynamic = 'force-dynamic';

export default async function StudentsPage() {
  const supabase = getSupabase();

  const { data: students } = await supabase
    .from('students')
    .select('*')
    .order('name');

  const { data: scores } = await supabase
    .from('test_scores')
    .select('*');

  const { data: attendance } = await supabase
    .from('attendance')
    .select('*');

  return (
    <StudentsClient
      students={students || []}
      scores={scores || []}
      attendance={attendance || []}
    />
  );
}
