import { getSupabase } from '@/lib/supabase';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = getSupabase();

  // 학생 목록
  const { data: students } = await supabase
    .from('students')
    .select('*')
    .order('name');

  // 최근 시험 점수
  const { data: scores } = await supabase
    .from('test_scores')
    .select('*')
    .order('test_date', { ascending: false })
    .limit(500);

  // 출결
  const { data: attendance } = await supabase
    .from('attendance')
    .select('*');

  return (
    <DashboardClient
      students={students || []}
      scores={scores || []}
      attendance={attendance || []}
    />
  );
}
