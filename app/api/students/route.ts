import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getKSTToday } from '@/lib/date';

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
        company_email: body.company_email || null,
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

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.department !== undefined) updateData.department = body.department || null;
    if (body.company_email !== undefined) updateData.company_email = body.company_email || null;
    if (body.email !== undefined) updateData.email = body.email || null;
    if (body.phone !== undefined) updateData.phone = body.phone || null;
    if (body.store_location !== undefined) updateData.store_location = body.store_location || null;
    if (body.password !== undefined) updateData.password = body.password;
    if (body.is_dropped !== undefined) {
      updateData.is_dropped = body.is_dropped;
      updateData.dropped_at = body.is_dropped ? (body.dropped_at || getKSTToday()) : null;
      updateData.drop_reason = body.is_dropped ? (body.drop_reason || null) : null;
    }

    const { error } = await supabase
      .from('students')
      .update(updateData)
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
