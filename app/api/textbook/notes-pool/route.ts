import { createServerClient } from '@/lib/supabase';

/**
 * 통합 교재용 일지 풀
 * - 모든 기수의 student_notes
 * - 교육일지 + 자율학습만 (실습일지 제외)
 * - student 정보, batch 정보 join
 * - 분류 결과(textbook_classifications)도 함께 반환
 */

interface RawNote {
  id: string;
  student_id: string;
  title: string;
  content: string;
  created_at: string;
  students?: { name: string; batch_id: string | null } | null;
}

interface UnpackedNote {
  id: string;
  student_id: string;
  student_name: string;
  batch_id: string | null;
  batch_label: string;
  title: string;
  date_label: string;
  created_at: string;
  is_self_study: boolean;
  step1: string;
  step2: string;
  step3: string;
  tags: string[];
  confidence: string | null;
  series: string[];        // 분류된 시리즈 배열
  classify_confidence: number;
}

function unpackSteps(content: string): { step1: string; step2: string; step3: string; tags: string[]; confidence: string | null } {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object') {
      if (parsed.steps) {
        const meta = parsed.meta || {};
        const steps = parsed.steps;
        return {
          step1: String(steps.step1 || '').trim(),
          step2: String(steps.step2 || '').trim(),
          step3: String(steps.step3 || '').trim(),
          tags: meta.tags || [],
          confidence: meta.confidence || null,
        };
      }
      if (parsed.blocks || parsed.text) {
        const meta = parsed.meta || {};
        const text = parsed.blocks ? JSON.stringify(parsed.blocks) : parsed.text;
        return { step1: text, step2: '', step3: '', tags: meta.tags || [], confidence: meta.confidence || null };
      }
    }
  } catch { /* plain text */ }
  return { step1: content, step2: '', step3: '', tags: [], confidence: null };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '?';
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}/${day}`;
}

export async function GET() {
  const supabase = createServerClient();

  // 1) 모든 노트 조회
  const { data: rawNotes, error } = await supabase
    .from('student_notes')
    .select('id, student_id, title, content, created_at, students(name, batch_id)')
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) return Response.json({ message: error.message }, { status: 500 });

  // 2) 기수 정보 조회 (라벨 매핑용)
  const { data: batches } = await supabase.from('batches').select('id, name');
  const batchMap = new Map<string, string>((batches || []).map((b) => [b.id, b.name]));

  // 3) 분류 결과 조회 (이미 분류된 노트들)
  const { data: classifs } = await supabase
    .from('textbook_classifications')
    .select('note_id, series_name, confidence');
  const classifyMap = new Map<string, { series: string[]; confidence: number }>();
  for (const c of classifs || []) {
    if (!classifyMap.has(c.note_id)) {
      classifyMap.set(c.note_id, { series: [], confidence: 0 });
    }
    const entry = classifyMap.get(c.note_id)!;
    entry.series.push(c.series_name);
    entry.confidence = Math.max(entry.confidence, Number(c.confidence) || 0);
  }

  // 4) 언팩 + 필터
  const pool: UnpackedNote[] = [];
  for (const row of (rawNotes || []) as unknown as RawNote[]) {
    const unpacked = unpackSteps(row.content);
    const tags = unpacked.tags || [];

    // 실습일지 제외
    if (tags.includes('실습일지')) continue;

    const isSelfStudy = tags.includes('자율학습');

    // 빈 노트 제외 (3 step 모두 비어있으면)
    if (!unpacked.step1 && !unpacked.step2 && !unpacked.step3) continue;

    const batchId = row.students?.batch_id || null;
    const batchLabel = batchId ? batchMap.get(batchId) || '?' : '?';

    const classify = classifyMap.get(row.id);

    pool.push({
      id: row.id,
      student_id: row.student_id,
      student_name: row.students?.name || '?',
      batch_id: batchId,
      batch_label: batchLabel,
      title: row.title,
      date_label: formatDate(row.created_at),
      created_at: row.created_at,
      is_self_study: isSelfStudy,
      step1: unpacked.step1,
      step2: unpacked.step2,
      step3: unpacked.step3,
      tags,
      confidence: unpacked.confidence,
      series: classify?.series || [],
      classify_confidence: classify?.confidence || 0,
    });
  }

  // 5) 통계
  const stats = {
    total: pool.length,
    education: pool.filter((n) => !n.is_self_study).length,
    self_study: pool.filter((n) => n.is_self_study).length,
    classified: pool.filter((n) => n.series.length > 0).length,
    unclassified: pool.filter((n) => n.series.length === 0).length,
  };

  return Response.json({ notes: pool, stats });
}
