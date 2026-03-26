import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const batchId = req.nextUrl.searchParams.get('batch_id');

    let query = supabase.from('students').select('*').order('name');
    if (batchId) query = query.eq('batch_id', batchId);

    const { data, error } = await query;
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
      .from('students')
      .insert({
        batch_id: body.batch_id,
        name: body.name,
        department: body.department || null,
        email: body.email || null,
        phone: body.phone || null,
        store_location: body.store_location || null,
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
      .from('students')
      .update({
        name: body.name,
        department: body.department || null,
        email: body.email || null,
        phone: body.phone || null,
        store_location: body.store_location || null,
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

    const { error } = await supabase.from('students').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
