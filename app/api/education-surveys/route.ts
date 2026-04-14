import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// GET /api/education-surveys?batchId=xxx 또는 ?studentId=xxx&phase=intro_end
export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const batchId = req.nextUrl.searchParams.get('batchId');
    const studentId = req.nextUrl.searchParams.get('studentId');
    const phase = req.nextUrl.searchParams.get('phase');

    let query = supabase.from('education_surveys').select('*');

    if (batchId) query = query.eq('batch_id', batchId);
    if (studentId) query = query.eq('student_id', studentId);
    if (phase) query = query.eq('phase', phase);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/education-surveys — 설문 제출 (upsert)
export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await req.json();

    const { batch_id, student_id, phase } = body;
    if (!batch_id || !student_id || !phase) {
      return NextResponse.json({ error: 'batch_id, student_id, phase 필수' }, { status: 400 });
    }

    const row = {
      batch_id,
      student_id,
      phase,
      eff_product: body.eff_product ?? null,
      eff_customer: body.eff_customer ?? null,
      eff_sales: body.eff_sales ?? null,
      eff_teamwork: body.eff_teamwork ?? null,
      eff_overall: body.eff_overall ?? null,
      sat_content: body.sat_content ?? null,
      sat_method: body.sat_method ?? null,
      sat_duration: body.sat_duration ?? null,
      open_strength: body.open_strength ?? null,
      open_worry: body.open_worry ?? null,
      open_goal: body.open_goal ?? null,
    };

    const { data, error } = await supabase
      .from('education_surveys')
      .upsert(row, { onConflict: 'batch_id,student_id,phase' })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
