import { NextRequest } from 'next/server';
import { getSupabase, createServerClient } from '@/lib/supabase';

// 리포트 조회 (report_group_id로 그룹핑)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const batchId = searchParams.get('batchId');
  const reportType = searchParams.get('reportType');
  const groupId = searchParams.get('groupId');
  const publishedOnly = searchParams.get('publishedOnly') === 'true';

  const supabase = getSupabase();

  // 발송된 리포트 목록 (매장 관리자용) — is_published=true 전체 조회
  if (publishedOnly) {
    let q = supabase
      .from('coaching_reports')
      .select('*, students!inner(name, store_location, batch_id, is_dropped)')
      .eq('is_published', true)
      .eq('students.is_dropped', false)
      .order('created_at', { ascending: false });

    if (batchId) q = q.eq('students.batch_id', batchId);
    if (reportType) q = q.eq('report_type', reportType);

    const { data, error } = await q;
    if (error) return Response.json({ message: error.message }, { status: 500 });
    return Response.json({ reports: data || [] });
  }

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

// 리포트 수정 (관리자가 AI 초안 편집) / 발송 처리 (publish)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createServerClient();

    // [발송 처리] { publishGroupId } — 해당 그룹만 is_published=true, 같은 학생들의 다른 리포트는 false
    if (body.publishGroupId) {
      const groupId = body.publishGroupId as string;

      // 해당 그룹의 학생 목록
      const { data: groupRows } = await supabase
        .from('coaching_reports')
        .select('student_id, report_type')
        .eq('report_group_id', groupId);

      if (!groupRows || groupRows.length === 0) {
        return Response.json({ message: '그룹을 찾을 수 없습니다.' }, { status: 404 });
      }
      const studentIds = [...new Set(groupRows.map((r) => r.student_id))];
      const reportType = groupRows[0].report_type;

      // 같은 학생 + 같은 report_type의 기존 published 해제
      await supabase
        .from('coaching_reports')
        .update({ is_published: false })
        .in('student_id', studentIds)
        .eq('report_type', reportType)
        .eq('is_published', true);

      // 지정 그룹 전체 published
      const { error } = await supabase
        .from('coaching_reports')
        .update({ is_published: true })
        .eq('report_group_id', groupId);

      if (error) return Response.json({ message: error.message }, { status: 500 });
      return Response.json({ message: '리포트가 매장 관리자에게 발송되었습니다.' });
    }

    // [발송 취소] { unpublishGroupId }
    if (body.unpublishGroupId) {
      const { error } = await supabase
        .from('coaching_reports')
        .update({ is_published: false })
        .eq('report_group_id', body.unpublishGroupId);
      if (error) return Response.json({ message: error.message }, { status: 500 });
      return Response.json({ message: '발송이 취소되었습니다.' });
    }

    // [기본: 개별 리포트 본문 수정]
    const { id, manager_report } = body;
    if (!id || !manager_report) {
      return Response.json({ message: 'id와 manager_report가 필요합니다.' }, { status: 400 });
    }
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

// 리포트 그룹 삭제 (슈퍼 관리자 전용)
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get('groupId');
  if (!groupId) return Response.json({ message: 'groupId가 필요합니다.' }, { status: 400 });

  const supabase = createServerClient();
  const { error } = await supabase
    .from('coaching_reports')
    .delete()
    .eq('report_group_id', groupId);

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ message: '리포트 그룹이 삭제되었습니다.' });
}
