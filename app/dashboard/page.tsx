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
    { data: notes },
    { data: announcements },
    { data: noteComments },
  ] = await Promise.all([
    supabase.from('batches').select('*').order('start_date', { ascending: false }),
    supabase.from('students').select('*').order('name'),
    supabase.from('test_scores').select('*').order('test_date', { ascending: false }).limit(500),
    supabase.from('attendance').select('*'),
    supabase.from('student_notes').select('id, student_id, title, content, created_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(5),
    supabase.from('note_comments').select('*').order('created_at', { ascending: false }).limit(100),
  ]);

  return (
    <DashboardClient
      batches={batches || []}
      students={students || []}
      scores={scores || []}
      attendance={attendance || []}
      notes={notes || []}
      announcements={announcements || []}
      noteComments={noteComments || []}
    />
  );
}
