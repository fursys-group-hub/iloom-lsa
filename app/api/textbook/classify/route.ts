import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { buildClassifyPrompt, parseClassifyResponse, NoteForClassify } from '@/lib/textbook-prompts';
import { findSeriesInText } from '@/lib/series-map';

/**
 * 시리즈 분류 API
 *
 * 1차: 정규식 매칭 (일지 본문에 명시된 시리즈명 직접 추출 — 빠르고 정확)
 * 2차: AI 분류 (정규식으로 못 찾은 일지만, ai_fallback=true일 때만)
 *
 * POST {
 *   note_ids?: string[],
 *   batch_size?: number,
 *   force?: boolean,
 *   ai_fallback?: boolean,  // 정규식으로 못 찾은 일지 AI에 보낼지 (기본 false)
 * }
 */

export const maxDuration = 300;

async function callGeminiClassify(notes: NoteForClassify[], geminiKey: string) {
  const prompt = buildClassifyPrompt(notes);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8000 },
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API 오류: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return parseClassifyResponse(text);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const targetIds: string[] | undefined = body.note_ids;
  const batchSize = Math.max(5, Math.min(50, Number(body.batch_size) || 30));
  const force = !!body.force;
  const aiFallback = !!body.ai_fallback;

  const geminiKey = process.env.GEMINI_API_KEY;

  const supabase = createServerClient();

  // 1) 노트 풀 조회
  let q = supabase
    .from('student_notes')
    .select('id, content')
    .order('created_at', { ascending: false })
    .limit(5000);
  if (targetIds && targetIds.length > 0) q = q.in('id', targetIds);

  const { data: rawNotes, error } = await q;
  if (error) return Response.json({ message: error.message }, { status: 500 });

  // 2) unpack + 실습일지 제외 + 빈 노트 제외
  const candidates: NoteForClassify[] = [];
  for (const row of rawNotes || []) {
    let parsed: { steps?: { step1?: string; step2?: string; step3?: string }; meta?: { tags?: string[] }; blocks?: unknown; text?: string } | null = null;
    try { parsed = JSON.parse(row.content); } catch { /* plain */ }

    const tags: string[] = parsed?.meta?.tags || [];
    if (tags.includes('실습일지')) continue;

    const step1 = parsed?.steps?.step1 || '';
    const step2 = parsed?.steps?.step2 || '';
    const step3 = parsed?.steps?.step3 || '';
    if (!step1 && !step2 && !step3 && !parsed?.blocks && !parsed?.text) continue;

    candidates.push({
      id: row.id,
      step1: String(step1).trim(),
      step2: String(step2).trim(),
      step3: String(step3).trim(),
      tags,
    });
  }

  // 3) force가 false면 이미 분류된 노트 제외
  if (!force) {
    const { data: existing } = await supabase
      .from('textbook_classifications')
      .select('note_id')
      .in('note_id', candidates.map((c) => c.id));
    const classifiedIds = new Set((existing || []).map((r) => r.note_id));
    const before = candidates.length;
    const filtered = candidates.filter((c) => !classifiedIds.has(c.id));
    candidates.length = 0;
    candidates.push(...filtered);
    if (candidates.length === 0) {
      return Response.json({ message: `이미 모두 분류됨 (${before}건)`, processed: 0, batches: 0 });
    }
  }

  // 4) 1차: 정규식 매칭 (일지 본문에서 시리즈명 직접 추출)
  const allResults: Array<{ note_id: string; series: string[]; confidence: number }> = [];
  const errors: string[] = [];
  const regexMatched: string[] = []; // 정규식으로 매칭된 note_id
  const regexUnmatched: NoteForClassify[] = []; // 매칭 안 된 노트

  for (const c of candidates) {
    const fullText = `${c.step1}\n${c.step2}\n${c.step3}`;
    const series = findSeriesInText(fullText);
    if (series.length > 0) {
      allResults.push({ note_id: c.id, series, confidence: 1.0 });
      regexMatched.push(c.id);
    } else {
      regexUnmatched.push(c);
    }
  }

  // 5) 2차: AI 분류 (옵션) — 정규식으로 못 찾은 노트만
  let batchCount = 0;
  if (aiFallback && regexUnmatched.length > 0) {
    if (!geminiKey) {
      errors.push('GEMINI_API_KEY 미설정 → AI 분류 스킵');
    } else {
      for (let i = 0; i < regexUnmatched.length; i += batchSize) {
        const batch = regexUnmatched.slice(i, i + batchSize);
        batchCount++;
        try {
          const res = await callGeminiClassify(batch, geminiKey);
          allResults.push(...res);
        } catch (e) {
          errors.push(`batch ${batchCount}: ${(e as Error).message}`);
        }
      }
    }
  }

  // 5) DB 저장 (force면 기존 분류 삭제 후 INSERT)
  if (force && allResults.length > 0) {
    const ids = allResults.map((r) => r.note_id);
    await supabase.from('textbook_classifications').delete().in('note_id', ids);
  }

  const rows: Array<{ note_id: string; series_name: string; confidence: number }> = [];
  for (const r of allResults) {
    if (!r.note_id || !Array.isArray(r.series)) continue;
    for (const s of r.series) {
      if (typeof s === 'string' && s.trim()) {
        rows.push({ note_id: r.note_id, series_name: s.trim(), confidence: r.confidence });
      }
    }
  }

  if (rows.length > 0) {
    // 청크 단위 INSERT (Supabase는 1요청 약 1000행 권장)
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error: insErr } = await supabase
        .from('textbook_classifications')
        .upsert(chunk, { onConflict: 'note_id,series_name' });
      if (insErr) errors.push(`insert chunk ${i}: ${insErr.message}`);
    }
  }

  // 6) 시리즈별 분류 통계
  const seriesCount: Record<string, number> = {};
  for (const r of rows) seriesCount[r.series_name] = (seriesCount[r.series_name] || 0) + 1;

  return Response.json({
    processed_notes: candidates.length,
    regex_matched: regexMatched.length,
    regex_unmatched: regexUnmatched.length,
    classified_pairs: rows.length,
    ai_batches: batchCount,
    errors,
    series_stats: seriesCount,
  });
}

/**
 * 수동 시리즈 보정
 * PUT { note_id, series: string[] }  // 해당 노트의 시리즈 분류를 강제로 덮어씀
 */
export async function PUT(req: NextRequest) {
  const { note_id, series } = await req.json();
  if (!note_id || !Array.isArray(series)) {
    return Response.json({ message: 'note_id와 series 배열 필요' }, { status: 400 });
  }
  const supabase = createServerClient();

  await supabase.from('textbook_classifications').delete().eq('note_id', note_id);

  if (series.length > 0) {
    const rows = series
      .filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s: string) => ({ note_id, series_name: s, confidence: 1.0 }));
    if (rows.length > 0) {
      const { error } = await supabase.from('textbook_classifications').insert(rows);
      if (error) return Response.json({ message: error.message }, { status: 500 });
    }
  }

  return Response.json({ ok: true });
}
