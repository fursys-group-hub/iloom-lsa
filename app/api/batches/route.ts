import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('batches')
      .select('*')
      .order('start_date', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await req.json();

    const { data, error } = await supabase
      .from('batches')
      .insert({
        name: body.name,
        start_date: body.start_date,
        end_date: body.end_date,
        sheet_id: body.sheet_id || null,
        subject_columns: body.subject_columns || {},
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await req.json();

    const { error } = await supabase
      .from('batches')
      .update({
        name: body.name,
        start_date: body.start_date,
        end_date: body.end_date,
        sheet_id: body.sheet_id || null,
      })
      .eq('id', body.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { id } = await req.json();

    // 소속 교육생 먼저 삭제
    await supabase.from('students').delete().eq('batch_id', id);
    const { error } = await supabase.from('batches').delete().eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
