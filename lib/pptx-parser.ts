/**
 * PPTX 텍스트 추출
 *
 * .pptx 파일은 zip 구조: ppt/slides/slide{N}.xml 안에 슬라이드 콘텐츠가 있음.
 * <a:t> 태그(텍스트 런)에서 텍스트를 모은다. 이미지/SmartArt/표 셀의 텍스트도
 * 대부분 <a:t>로 들어있어서 충분히 커버된다.
 */

import AdmZip from 'adm-zip';
import { parseStringPromise } from 'xml2js';
import fs from 'fs/promises';

export interface SlideText {
  slide_no: number;
  text: string;       // 슬라이드 한 장의 모든 텍스트 (줄바꿈 보존)
  title?: string;     // 첫 텍스트 박스 (헤더 추정)
}

export interface PptxExtractResult {
  file_name: string;
  slide_count: number;
  slides: SlideText[];
  full_text: string;  // 슬라이드 사이를 구분자로 합친 전체 텍스트
}

/** XML 트리에서 모든 <a:t> 노드의 텍스트를 깊이우선으로 수집 */
function collectTextsFromNode(node: unknown, out: string[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectTextsFromNode(item, out);
    return;
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    for (const [key, val] of Object.entries(obj)) {
      if (key === 'a:t') {
        if (typeof val === 'string') out.push(val);
        else if (Array.isArray(val)) {
          for (const v of val) {
            if (typeof v === 'string') out.push(v);
            else if (v && typeof v === 'object' && '_' in v) out.push(String((v as { _: unknown })._));
          }
        }
      } else {
        collectTextsFromNode(val, out);
      }
    }
  }
}

/** PPT 파일 buffer에서 슬라이드별 텍스트 추출 */
export async function extractPptxText(buffer: Buffer, fileName = 'unknown.pptx'): Promise<PptxExtractResult> {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  const slideEntries = entries
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => {
      const an = parseInt(a.entryName.match(/slide(\d+)\.xml$/)?.[1] || '0', 10);
      const bn = parseInt(b.entryName.match(/slide(\d+)\.xml$/)?.[1] || '0', 10);
      return an - bn;
    });

  const slides: SlideText[] = [];
  for (const entry of slideEntries) {
    const slideNo = parseInt(entry.entryName.match(/slide(\d+)\.xml$/)?.[1] || '0', 10);
    const xml = entry.getData().toString('utf-8');
    let texts: string[] = [];
    try {
      const parsed = await parseStringPromise(xml, { explicitArray: true });
      collectTextsFromNode(parsed, texts);
    } catch {
      // XML 파싱 실패 시 정규식 폴백
      texts = Array.from(xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)).map((m) => m[1] || '');
    }
    const cleaned = texts
      .map((t) => t.replace(/ /g, ' ').trim())
      .filter(Boolean);
    const text = cleaned.join('\n');
    slides.push({
      slide_no: slideNo,
      text,
      title: cleaned[0],
    });
  }

  const full_text = slides
    .map((s) => `--- Slide ${s.slide_no}${s.title ? ': ' + s.title : ''} ---\n${s.text}`)
    .join('\n\n');

  return {
    file_name: fileName,
    slide_count: slides.length,
    slides,
    full_text,
  };
}

/** 파일 경로로 PPTX 추출 */
export async function extractPptxFromPath(filePath: string): Promise<PptxExtractResult> {
  const buffer = await fs.readFile(filePath);
  const fileName = filePath.split(/[\\/]/).pop() || 'unknown.pptx';
  return extractPptxText(buffer, fileName);
}
