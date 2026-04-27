import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { buildDraftPrompt, parseDraftResponse, NoteForDraft, PptxSeed } from '@/lib/textbook-prompts';
import { getCategoryBySeriesName } from '@/lib/series-map';

/**
 * 시리즈별 챕터 초안 생성
 * POST { series_name: string, force?: boolean }
 *
 * - 분류된 노트(textbook_classifications) + 기존 PPT 시드 결합
 * - Gemini 2.5 Flash 호출 → 4섹션 HTML
 * - textbook_chapters에 status='draft'로 upsert
 */

export const maxDuration = 300;

const ALL_SERIES = '_all_';

interface RawNote {
  id: string;
  content: string;
  created_at: string;
  students?: { name: string; batch_id: string | null } | null;
}

function unpackForDraft(row: RawNote, batchMap: Map<string, string>): NoteForDraft | null {
  let step1 = '', step2 = '', step3 = '', tags: string[] = [];
  try {
    const parsed = JSON.parse(row.content);
    if (parsed?.steps) {
      step1 = String(parsed.steps.step1 || '').trim();
      step2 = String(parsed.steps.step2 || '').trim();
      step3 = String(parsed.steps.step3 || '').trim();
      tags = parsed.meta?.tags || [];
    } else if (parsed?.text) {
      step1 = String(parsed.text);
      tags = parsed.meta?.tags || [];
    }
  } catch { /* plain */ }

  if (tags.includes('실습일지')) return null;
  if (!step1 && !step2 && !step3) return null;

  const d = new Date(row.created_at);
  const dateLabel = isNaN(d.getTime()) ? '?' : `${d.getMonth() + 1}/${d.getDate()}`;
  const batchId = row.students?.batch_id || null;
  const batchLabel = batchId ? batchMap.get(batchId) || '?' : '?';

  return {
    id: row.id,
    student_name: row.students?.name || '?',
    batch_label: batchLabel,
    date_label: dateLabel,
    is_self_study: tags.includes('자율학습'),
    step1, step2, step3,
  };
}

export async function POST(req: NextRequest) {
  const { series_name, force } = await req.json();
  if (!series_name || typeof series_name !== 'string') {
    return Response.json({ message: 'series_name 필요' }, { status: 400 });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return Response.json({ message: 'GEMINI_API_KEY 미설정' }, { status: 500 });

  const supabase = createServerClient();

  // 1) 기존 챕터 확인 (force=false인데 final이면 거부)
  const { data: existing } = await supabase
    .from('textbook_chapters')
    .select('id, status')
    .eq('series_name', series_name)
    .maybeSingle();
  if (existing && existing.status === 'final' && !force) {
    return Response.json({ message: `이미 완료된 챕터입니다. force=true로 재생성 가능` }, { status: 409 });
  }

  // 2) 해당 시리즈로 분류된 note_id 수집
  const { data: classifs, error: cErr } = await supabase
    .from('textbook_classifications')
    .select('note_id, confidence')
    .eq('series_name', series_name);
  if (cErr) return Response.json({ message: cErr.message }, { status: 500 });

  const noteIds = (classifs || []).map((c) => c.note_id);
  if (noteIds.length === 0) {
    return Response.json({ message: `'${series_name}' 시리즈로 분류된 노트가 없습니다. 먼저 분류를 실행하세요.` }, { status: 400 });
  }

  // 3) 노트 본문 + 학생/기수 정보
  const { data: rawNotes, error: nErr } = await supabase
    .from('student_notes')
    .select('id, content, created_at, students(name, batch_id)')
    .in('id', noteIds);
  if (nErr) return Response.json({ message: nErr.message }, { status: 500 });

  const { data: batches } = await supabase.from('batches').select('id, name');
  const batchMap = new Map<string, string>((batches || []).map((b) => [b.id, b.name]));

  const notes: NoteForDraft[] = [];
  for (const row of (rawNotes || []) as unknown as RawNote[]) {
    const n = unpackForDraft(row, batchMap);
    if (n) notes.push(n);
  }

  // 4) PPT 시드 (전체 적용 = ALL_SERIES)
  const { data: sources } = await supabase
    .from('textbook_sources')
    .select('id, file_name, full_text')
    .eq('series_name', ALL_SERIES);
  const seeds: PptxSeed[] = (sources || []).map((s) => ({
    file_name: s.file_name,
    full_text: s.full_text || '',
  }));

  // 5) Gemini 호출
  const prompt = buildDraftPrompt(series_name, notes, seeds);
  const t0 = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 8000 },
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    return Response.json({ message: `Gemini API 오류: ${err.slice(0, 500)}` }, { status: 500 });
  }
  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const html = parseDraftResponse(rawText);
  const elapsed = Date.now() - t0;

  if (!html || html.length < 100) {
    return Response.json({ message: `Gemini 출력이 비어있거나 너무 짧습니다.`, raw: rawText.slice(0, 500) }, { status: 500 });
  }

  // 6) DB 저장 (upsert)
  const category = getCategoryBySeriesName(series_name);
  const sourceNoteIds = notes.map((n) => n.id);
  const sourcePptxIds = (sources || []).map((s) => s.id);

  const { error: upErr } = await supabase
    .from('textbook_chapters')
    .upsert(
      {
        series_name,
        category,
        html_content: html,
        status: 'draft',
        source_note_ids: sourceNoteIds,
        source_pptx_ids: sourcePptxIds,
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'series_name' },
    );
  if (upErr) return Response.json({ message: upErr.message }, { status: 500 });

  return Response.json({
    series_name,
    category,
    html_length: html.length,
    elapsed_ms: elapsed,
    note_count: notes.length,
    seed_count: seeds.length,
  });
}
