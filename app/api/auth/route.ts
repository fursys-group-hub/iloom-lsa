import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { name, password } = await req.json();

  if (!name || !password) {
    return Response.json({ message: '이름과 비밀번호를 입력해주세요.' }, { status: 400 });
  }

  // 슈퍼관리자 체크
  if (name.trim() === '김수지' && password === '4851') {
    return Response.json({ role: 'admin', name: '김수지' });
  }

  const supabase = getSupabase();

  // 매장 교육관리자 / 교육TF 체크
  const { data: manager } = await supabase
    .from('managers')
    .select('id, name, password, store_name')
    .eq('name', name.trim())
    .single();

  if (manager) {
    if (manager.password !== password) {
      return Response.json({ message: '비밀번호가 올바르지 않아요.' }, { status: 401 });
    }
    return Response.json({
      role: 'manager',
      name: manager.name,
      managerId: manager.id,
      storeName: manager.store_name,
    });
  }

  // 학생 체크
  const { data: student } = await supabase
    .from('students')
    .select('id, name, password, is_dropped, batch_id')
    .eq('name', name.trim())
    .single();

  if (!student) {
    return Response.json({ message: '등록되지 않은 이름이에요.' }, { status: 401 });
  }

  if (student.password !== password) {
    return Response.json({ message: '비밀번호가 올바르지 않아요.' }, { status: 401 });
  }

  if (student.is_dropped) {
    return Response.json({ message: '퇴사 처리된 계정이에요. 관리자에게 문의해주세요.' }, { status: 403 });
  }

  return Response.json({ role: 'student', name: student.name, studentId: student.id, batchId: student.batch_id });
}
