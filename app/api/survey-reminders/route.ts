import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

// GET: 학생의 활성(미확인) 재촉 알림 조회
// ?student_id=X  → 특정 학생의 active(dismissed_at IS NULL)
// ?student_id=X&all=true  → dismiss된 것까지 전체
export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const studentId = req.nextUrl.searchParams.get('student_id');
  const all = req.nextUrl.searchParams.get('all') === 'true';

  if (!studentId) {
    return NextResponse.json({ error: 'student_id 필수' }, { status: 400 });
  }

  let query = supabase
    .from('survey_reminders')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (!all) query = query.is('dismissed_at', null);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

// POST: 재촉 알림 생성
// body: { student_id, survey_type, phase, survey_name, phase_label, message? }
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const body = await req.json();
  const { student_id, survey_type, phase, survey_name, phase_label, message } = body;

  if (!student_id || !survey_type || !phase || !survey_name || !phase_label) {
    return NextResponse.json({
      error: 'student_id, survey_type, phase, survey_name, phase_label 필수'
    }, { status: 400 });
  }

  // 같은 student_id + survey_type + phase 조합이 이미 활성 상태로 있으면 재사용
  const { data: existing } = await supabase
    .from('survey_reminders')
    .select('*')
    .eq('student_id', student_id)
    .eq('survey_type', survey_type)
    .eq('phase', phase)
    .is('dismissed_at', null)
    .maybeSingle();

  if (existing) {
    // created_at만 갱신(다시 재촉)
    const { data, error } = await supabase
      .from('survey_reminders')
      .update({ created_at: new Date().toISOString(), message: message ?? existing.message })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ...data, renewed: true });
  }

  const { data, error } = await supabase
    .from('survey_reminders')
    .insert({ student_id, survey_type, phase, survey_name, phase_label, message: message ?? null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH: 알림 확인(dismiss) 처리
// body: { id }  또는  { student_id, survey_type, phase }  (후자: 제출 완료 시 자동 dismiss)
export async function PATCH(req: NextRequest) {
  const supabase = getSupabase();
  const body = await req.json();
  const { id, student_id, survey_type, phase } = body;

  const now = new Date().toISOString();

  if (id) {
    const { data, error } = await supabase
      .from('survey_reminders')
      .update({ dismissed_at: now })
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (student_id && survey_type && phase) {
    const { data, error } = await supabase
      .from('survey_reminders')
      .update({ dismissed_at: now })
      .eq('student_id', student_id)
      .eq('survey_type', survey_type)
      .eq('phase', phase)
      .is('dismissed_at', null)
      .select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'id 또는 (student_id, survey_type, phase) 필수' }, { status: 400 });
}
