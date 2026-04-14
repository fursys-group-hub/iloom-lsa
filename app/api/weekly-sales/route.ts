import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import * as XLSX from 'xlsx';

// GET /api/weekly-sales?batchId=xxx
export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const batchId = req.nextUrl.searchParams.get('batchId');
    if (!batchId) return NextResponse.json({ error: 'batchId required' }, { status: 400 });

    const { data, error } = await supabase
      .from('weekly_sales')
      .select('*')
      .eq('batch_id', batchId)
      .order('week', { ascending: true });

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/weekly-sales — 엑셀 업로드 또는 JSON 직접 입력
export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const contentType = req.headers.get('content-type') || '';

    // JSON 직접 입력
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const { rows, batch_id } = body;
      if (!batch_id || !Array.isArray(rows)) {
        return NextResponse.json({ error: 'batch_id, rows[] 필수' }, { status: 400 });
      }

      const upsertRows = rows.map((r: Record<string, unknown>) => ({
        batch_id,
        student_id: r.student_id,
        week: r.week,
        consult: r.consult ?? 0,
        estimate: r.estimate ?? 0,
        orders: r.orders ?? 0,
        amount: r.amount ?? 0,
        categories: r.categories ?? [],
        note: r.note ?? null,
      }));

      const { data, error } = await supabase
        .from('weekly_sales')
        .upsert(upsertRows, { onConflict: 'batch_id,student_id,week' })
        .select();

      if (error) throw error;
      return NextResponse.json({ inserted: data?.length || 0, data });
    }

    // 엑셀 업로드 (multipart/form-data)
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const batchId = formData.get('batchId') as string;
    if (!file || !batchId) {
      return NextResponse.json({ error: 'file, batchId 필수' }, { status: 400 });
    }

    // 학생 목록 조회 (이름 → ID 매핑)
    const { data: students } = await supabase
      .from('students')
      .select('id, name')
      .eq('batch_id', batchId);

    const nameMap = new Map<string, string>();
    for (const s of students || []) nameMap.set(s.name, s.id);

    // 엑셀 파싱
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    const upsertRows = [];
    const errors: string[] = [];

    for (let i = 0; i < jsonRows.length; i++) {
      const row = jsonRows[i];
      const name = String(row['교육생명'] || row['이름'] || row['name'] || '').trim();
      const studentId = nameMap.get(name);
      if (!studentId) {
        errors.push(`${i + 2}행: '${name}' 교육생을 찾을 수 없어요`);
        continue;
      }

      const week = Number(row['주차'] || row['week'] || 0);
      if (week < 1 || week > 12) {
        errors.push(`${i + 2}행: 주차(${week})가 올바르지 않아요 (1~12)`);
        continue;
      }

      upsertRows.push({
        batch_id: batchId,
        student_id: studentId,
        week,
        consult: Number(row['상담'] || row['consult'] || 0),
        estimate: Number(row['견적'] || row['estimate'] || 0),
        orders: Number(row['수주'] || row['orders'] || 0),
        amount: Number(row['금액'] || row['amount'] || 0),
        categories: row['카테고리'] ? String(row['카테고리']).split(',').map(s => s.trim()) : [],
        note: row['메모'] || row['note'] || null,
      });
    }

    if (upsertRows.length > 0) {
      const { error } = await supabase
        .from('weekly_sales')
        .upsert(upsertRows, { onConflict: 'batch_id,student_id,week' });
      if (error) throw error;
    }

    return NextResponse.json({
      inserted: upsertRows.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/weekly-sales?batchId=xxx&week=N
export async function DELETE(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const batchId = req.nextUrl.searchParams.get('batchId');
    const week = req.nextUrl.searchParams.get('week');
    if (!batchId) return NextResponse.json({ error: 'batchId required' }, { status: 400 });

    let query = supabase.from('weekly_sales').delete().eq('batch_id', batchId);
    if (week) query = query.eq('week', Number(week));

    const { error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
