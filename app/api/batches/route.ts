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
        advanced_start: body.advanced_start || null,
        advanced_end: body.advanced_end || null,
        sheet_id: body.sheet_id || null,
        subject_columns: body.subject_columns || {},
        advanced_sheet_id: body.advanced_sheet_id || null,
        advanced_pass_score:
          typeof body.advanced_pass_score === 'number' ? body.advanced_pass_score : 80,
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

    // 아카이브 처리
    if (body.is_archived !== undefined) {
      const { error: archiveError } = await supabase
        .from('batches')
        .update({
          is_archived: body.is_archived,
          archived_at: body.is_archived ? new Date().toISOString() : null,
        })
        .eq('id', body.id);
      if (archiveError) throw archiveError;
      return NextResponse.json({ success: true });
    }

    // 스케줄만 업데이트
    if (body.schedule !== undefined) {
      const { error: schedError } = await supabase
        .from('batches')
        .update({ schedule: body.schedule })
        .eq('id', body.id);
      if (schedError) throw schedError;
      return NextResponse.json({ success: true });
    }

    const updatePayload: Record<string, unknown> = {
      name: body.name,
      start_date: body.start_date,
      end_date: body.end_date,
      advanced_start: body.advanced_start || null,
      advanced_end: body.advanced_end || null,
      sheet_id: body.sheet_id || null,
    };
    if (body.advanced_sheet_id !== undefined) {
      updatePayload.advanced_sheet_id = body.advanced_sheet_id || null;
    }
    if (typeof body.advanced_pass_score === 'number') {
      updatePayload.advanced_pass_score = body.advanced_pass_score;
    }

    const { error } = await supabase
      .from('batches')
      .update(updatePayload)
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
