import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// GET /api/ansan-tour-surveys?studentId=xxx&phase=pre|post
// GET /api/ansan-tour-surveys?batchId=xxx
export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const batchId = req.nextUrl.searchParams.get('batchId');
    const studentId = req.nextUrl.searchParams.get('studentId');
    const phase = req.nextUrl.searchParams.get('phase');

    let query = supabase.from('ansan_tour_surveys').select('*');
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

// POST /api/ansan-tour-surveys — upsert
export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await req.json();

    const { batch_id, student_id, phase } = body;
    if (!batch_id || !student_id || !phase) {
      return NextResponse.json({ error: 'batch_id, student_id, phase 필수' }, { status: 400 });
    }
    if (phase !== 'pre' && phase !== 'post') {
      return NextResponse.json({ error: 'phase는 pre 또는 post' }, { status: 400 });
    }

    const row: Record<string, unknown> = {
      batch_id,
      student_id,
      phase,
      // 자가진단 9문항
      know_products:    body.know_products    ?? null,
      know_factory:     body.know_factory     ?? null,
      know_sofa:        body.know_sofa        ?? null,
      know_mattress:    body.know_mattress    ?? null,
      know_steel:       body.know_steel       ?? null,
      know_quality:     body.know_quality     ?? null,
      know_competitive: body.know_competitive ?? null,
      know_explain:     body.know_explain     ?? null,
      know_value:       body.know_value       ?? null,
      // 사전 호기심
      curiosity_sofa:     body.curiosity_sofa     ?? null,
      curiosity_mattress: body.curiosity_mattress ?? null,
      curiosity_steel:    body.curiosity_steel    ?? null,
      curiosity_quality:  body.curiosity_quality  ?? null,
      curiosity_other:    body.curiosity_other    ?? null,
      // 사후 만족도/NPS
      sat_process:   body.sat_process   ?? null,
      sat_helpful:   body.sat_helpful   ?? null,
      sat_guide:     body.sat_guide     ?? null,
      sat_operation: body.sat_operation ?? null,
      sat_duration:  body.sat_duration  ?? null,
      nps:           body.nps           ?? null,
      // 사후 인상
      best_line:        body.best_line        ?? null,
      best_reason:      body.best_reason      ?? null,
      learned_sofa:     body.learned_sofa     ?? null,
      learned_mattress: body.learned_mattress ?? null,
      learned_steel:    body.learned_steel    ?? null,
      confident_to_say: body.confident_to_say ?? null,
      improvement:      body.improvement      ?? null,
    };

    const { data, error } = await supabase
      .from('ansan_tour_surveys')
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
