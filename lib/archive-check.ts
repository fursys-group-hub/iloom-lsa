import { SupabaseClient } from '@supabase/supabase-js';

/**
 * 학생의 기수가 아카이브 상태인지 확인
 * @returns true면 아카이브됨 (쓰기 차단)
 */
export async function isBatchArchived(supabase: SupabaseClient, studentId: string): Promise<boolean> {
  const { data: student } = await supabase
    .from('students')
    .select('batch_id')
    .eq('id', studentId)
    .single();

  if (!student) return false;

  const { data: batch } = await supabase
    .from('batches')
    .select('is_archived')
    .eq('id', student.batch_id)
    .single();

  return batch?.is_archived === true;
}
