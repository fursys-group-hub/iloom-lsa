import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const date = req.nextUrl.searchParams.get('date');
    const studentId = req.nextUrl.searchParams.get('student_id');

    let query = supabase
      .from('education_logs')
      .select('*, students(name, department)')
      .order('submitted_at', { ascending: false });

    if (date) query = query.eq('date', date);
    if (studentId) query = query.eq('student_id', studentId);

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

    // 이름으로 student_id 찾기
    let studentId = body.student_id;
    if (!studentId && body.student_name) {
      const { data: student } = await supabase
        .from('students')
        .select('id')
        .eq('name', body.student_name)
        .single();
      if (student) studentId = student.id;
    }

    if (!studentId) {
      return NextResponse.json({ error: '교육생을 찾을 수 없습니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('education_logs')
      .upsert(
        {
          student_id: studentId,
          date: body.date,
          today_comment: body.today_comment || null,
          tags: body.tags || [],
          confidence: body.confidence || null,
          key_notes: body.key_notes || null,
          memorization_points: body.memorization_points || null,
          furniture_one_pick: body.furniture_one_pick || null,
          tomorrow_task: body.tomorrow_task || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'student_id,date' }
      )
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { id } = await req.json();

    const { error } = await supabase.from('education_logs').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
