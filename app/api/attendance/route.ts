import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { records } = await req.json();

    if (!records || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: '출결 데이터가 없습니다.' }, { status: 400 });
    }

    const { data: students } = await supabase.from('students').select('id, name');
    if (!students) {
      return NextResponse.json({ error: '교육생 목록을 불러올 수 없습니다.' }, { status: 500 });
    }
    const nameToId = new Map(students.map((s) => [s.name, s.id]));

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const record of records) {
      const studentId = nameToId.get(record.name);
      if (!studentId) {
        errors.push(`"${record.name}" — 등록되지 않은 교육생`);
        skipped++;
        continue;
      }

      const { error } = await supabase
        .from('attendance')
        .upsert(
          {
            student_id: studentId,
            date: record.date,
            status: record.status,
            note: record.note || null,
          },
          { onConflict: 'student_id,date' }
        );

      if (error) {
        errors.push(`${record.name} (${record.date}): ${error.message}`);
        skipped++;
      } else {
        inserted++;
      }
    }

    return NextResponse.json({ inserted, skipped, errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('attendance')
      .select('*, students(name, department)')
      .order('date', { ascending: false })
      .limit(1000);

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
    const { id, status, note } = await req.json();

    if (!id || !status) {
      return NextResponse.json({ error: 'id와 status가 필요합니다.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('attendance')
      .update({ status, note: note || null })
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
