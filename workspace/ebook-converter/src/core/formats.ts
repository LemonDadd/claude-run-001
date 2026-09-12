import type { Format } from './types';
import JSZip from 'jszip';

export const FORMAT_LABELS: Record<Format, string> = {
  txt: 'TXT',
  docx: 'DOCX',
  epub: 'EPUB',
  pdf: 'PDF',
};

export const FORMAT_MIMES: Record<Format, string> = {
  txt: 'text/plain;charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
};

export const FORMAT_EXTENSIONS: Record<Format, string> = {
  txt: 'txt',
  docx: 'docx',
  epub: 'epub',
  pdf: 'pdf',
};

export const ALL_FORMATS: Format[] = ['txt', 'docx', 'epub', 'pdf'];

/**
 * 合法转换组合：四种格式两两互转（不支持同格式）。
 * PDF 为文字型 PDF；扫描件/图片 PDF 无法提取文字。
 */
export function legalTargets(source: Format): Format[] {
  return ALL_FORMATS.filter((f) => f !== source);
}

const EXT_MAP: Record<string, Format> = {
  txt: 'txt',
  text: 'txt',
  docx: 'docx',
  epub: 'epub',
  pdf: 'pdf',
};

export function formatFromName(name: string): Format | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MAP[ext] ?? null;
}

/**
 * 识别文件格式：优先按文件头魔数识别，识别不出再回退扩展名。
 */
export async function detectFormat(file: File): Promise<Format | null> {
  const sniffed = await sniff(file);
  if (sniffed) return sniffed;
  return formatFromName(file.name);
}

async function sniff(file: File): Promise<Format | null> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  } catch {
    return null;
  }

  // %PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'pdf';
  }

  // ZIP 容器：EPUB / DOCX
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05)) {
    try {
      const buf = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(buf);
      const mimetype = zip.file('mimetype');
      if (mimetype && (await mimetype.async('string')).includes('epub')) {
        return 'epub';
      }
      if (zip.file('word/document.xml')) {
        return 'docx';
      }
    } catch {
      return null;
    }
  }

  return null;
}

export function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

/** 清理用户输入的文件名 */
export function sanitizeName(name: string, fallback = 'converted'): string {
  const cleaned = name
    .replace(/[\\/:*?\"<>|\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 120) || fallback;
}
