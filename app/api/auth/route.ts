import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { name, password } = await req.json();

  if (!name || !password) {
    return Response.json({ message: '이름과 비밀번호를 입력해주세요.' }, { status: 400 });
  }

  // 관리자 체크 (이름: 김수지, 비밀번호: 1230)
  if (name.trim() === '김수지' && password === '1230') {
    return Response.json({ role: 'admin', name: '김수지' });
  }

  // 학생 체크
  const supabase = getSupabase();
  const { data: student } = await supabase
    .from('students')
    .select('id, name, password')
    .eq('name', name.trim())
    .single();

  if (!student) {
    return Response.json({ message: '등록되지 않은 이름이에요.' }, { status: 401 });
  }

  if (student.password !== password) {
    return Response.json({ message: '비밀번호가 올바르지 않아요.' }, { status: 401 });
  }

  return Response.json({ role: 'student', name: student.name, studentId: student.id });
}
