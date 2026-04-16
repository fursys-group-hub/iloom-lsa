import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

// GET: 학생의 할 일 조회
// ?student_id=X&date=2026-04-15  → 특정 학생
// ?student_ids=id1,id2&date=...  → 여러 학생 (관리자용)
export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const studentId = req.nextUrl.searchParams.get('student_id');
  const studentIds = req.nextUrl.searchParams.get('student_ids');
  const date = req.nextUrl.searchParams.get('date');

  if (!studentId && !studentIds) return NextResponse.json({ error: 'student_id 또는 student_ids 필수' }, { status: 400 });

  let query = supabase.from('student_todos').select('*').order('sort_order').order('created_at');

  if (studentIds) {
    const ids = studentIds.split(',').filter(Boolean);
    query = query.in('student_id', ids);
  } else if (studentId) {
    query = query.eq('student_id', studentId);
  }

  if (date) query = query.eq('date', date);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST: 할 일 추가
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const body = await req.json();
  const { student_id, date, text } = body;

  if (!student_id || !date || !text?.trim()) {
    return NextResponse.json({ error: 'student_id, date, text 필수' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('student_todos')
    .insert({ student_id, date, text: text.trim(), done: false })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH: 할 일 수정
export async function PATCH(req: NextRequest) {
  const supabase = getSupabase();
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

  const { data, error } = await supabase
    .from('student_todos')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE: 할 일 삭제
export async function DELETE(req: NextRequest) {
  const supabase = getSupabase();
  const id = req.nextUrl.searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

  const { error } = await supabase.from('student_todos').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
