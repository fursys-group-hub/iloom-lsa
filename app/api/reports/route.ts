import { NextRequest } from 'next/server';
import { getSupabase, createServerClient } from '@/lib/supabase';

// 리포트 조회 (report_group_id로 그룹핑)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const batchId = searchParams.get('batchId');
  const reportType = searchParams.get('reportType');
  const groupId = searchParams.get('groupId');

  const supabase = getSupabase();

  // 특정 그룹의 상세 조회
  if (groupId) {
    const { data, error } = await supabase
      .from('coaching_reports')
      .select('*, students!inner(name, store_location)')
      .eq('report_group_id', groupId)
      .order('students(name)', { ascending: true });

    if (error) return Response.json({ message: error.message }, { status: 500 });
    return Response.json({ reports: data || [] });
  }

  // 리포트 목록 조회 (그룹별)
  let query = supabase
    .from('coaching_reports')
    .select('id, test_date, report_type, report_group_id, subject, created_at, student_id')
    .order('created_at', { ascending: false });

  if (reportType) query = query.eq('report_type', reportType);

  // batchId 필터: students 테이블과 조인
  if (batchId) {
    const { data: students } = await supabase
      .from('students')
      .select('id')
      .eq('batch_id', batchId)
      .eq('is_dropped', false);

    if (students && students.length > 0) {
      const studentIds = students.map(s => s.id);
      query = query.in('student_id', studentIds);
    }
  }

  const { data, error } = await query.limit(500);
  if (error) return Response.json({ message: error.message }, { status: 500 });

  // report_group_id로 그룹핑
  const groups: Record<string, {
    groupId: string;
    reportType: string;
    subject: string | null;
    testDate: string;
    createdAt: string;
    studentCount: number;
  }> = {};

  for (const r of (data || [])) {
    const gid = r.report_group_id || r.id;
    if (!groups[gid]) {
      groups[gid] = {
        groupId: gid,
        reportType: r.report_type || 'daily',
        subject: r.subject,
        testDate: r.test_date,
        createdAt: r.created_at,
        studentCount: 0,
      };
    }
    groups[gid].studentCount++;
  }

  const reportGroups = Object.values(groups).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return Response.json({ groups: reportGroups });
}

// 리포트 수정 (관리자가 AI 초안 편집)
export async function PATCH(req: NextRequest) {
  try {
    const { id, manager_report } = await req.json();

    if (!id || !manager_report) {
      return Response.json({ message: 'id와 manager_report가 필요합니다.' }, { status: 400 });
    }

    const supabase = createServerClient();
    const { error } = await supabase
      .from('coaching_reports')
      .update({ manager_report })
      .eq('id', id);

    if (error) return Response.json({ message: error.message }, { status: 500 });
    return Response.json({ message: '리포트가 수정되었습니다.' });
  } catch {
    return Response.json({ message: '리포트 수정 실패' }, { status: 500 });
  }
}
