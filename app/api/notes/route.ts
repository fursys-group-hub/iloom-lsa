import { NextRequest } from 'next/server';
import { createServerClient, getSupabase } from '@/lib/supabase';

// 노트 조회
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('studentId');
  const all = searchParams.get('all'); // 교육자가 전체 노트 조회

  const supabase = getSupabase();
  let query = supabase.from('student_notes').select('*, students(name)').order('created_at', { ascending: false });

  if (studentId && !all) query = query.eq('student_id', studentId);

  const { data, error } = await query.limit(100);
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ notes: data });
}

// 노트 생성
export async function POST(req: NextRequest) {
  const { student_id, title, content, tags, confidence } = await req.json();

  if (!student_id || !title || !content) {
    return Response.json({ message: '제목과 내용을 입력해주세요.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('student_notes')
    .insert({ student_id, title, content, tags: tags || [], confidence: confidence || null })
    .select('*')
    .single();

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ note: data, message: '저장 완료!' });
}

// 노트 수정
export async function PATCH(req: NextRequest) {
  const { id, title, content, tags, confidence } = await req.json();

  const supabase = createServerClient();
  const { error } = await supabase
    .from('student_notes')
    .update({ title, content, tags, confidence, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ message: '수정 완료!' });
}

// 노트 삭제
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  const supabase = createServerClient();
  const { error } = await supabase.from('student_notes').delete().eq('id', id);

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ message: '삭제 완료!' });
}
