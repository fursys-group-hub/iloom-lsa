import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

// GET: 날짜별 메모 조회 (?date=2026-04-14 또는 ?month=2026-04 전체)
export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const date = req.nextUrl.searchParams.get('date');
  const month = req.nextUrl.searchParams.get('month');

  let query = supabase.from('calendar_memos').select('*').order('sort_order').order('created_at');

  if (date) {
    query = query.eq('date', date);
  } else if (month) {
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    query = query.gte('date', `${month}-01`).lte('date', `${month}-${String(lastDay).padStart(2, '0')}`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST: 메모 추가
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const body = await req.json();
  const { date, text } = body;

  if (!date || !text?.trim()) {
    return NextResponse.json({ error: 'date, text 필수' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('calendar_memos')
    .insert({ date, text: text.trim(), done: false })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH: 메모 수정 (완료 토글, 텍스트 수정)
export async function PATCH(req: NextRequest) {
  const supabase = getSupabase();
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

  const { data, error } = await supabase
    .from('calendar_memos')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE: 메모 삭제
export async function DELETE(req: NextRequest) {
  const supabase = getSupabase();
  const id = req.nextUrl.searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

  const { error } = await supabase.from('calendar_memos').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
