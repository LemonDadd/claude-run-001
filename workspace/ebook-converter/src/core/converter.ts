import type { Format, Book, BuiltFile, ConvertOptions } from './types';
import { parseTxt } from './parseTxt';
import { parseDocx } from './parseDocx';
import { parseEpub } from './parseEpub';
import { parsePdf } from './parsePdf';
import { buildTxt } from './buildTxt';
import { buildDocx } from './buildDocx';
import { buildEpub } from './buildEpub';
import { buildPdf } from './buildPdf';

export interface ConvertParams {
  file: File;
  source: Format;
  target: Format;
  txtEncoding: 'utf-8' | 'gbk';
  outputName: string;
  epubTitle?: string;
  signal: AbortSignal;
  onProgress?: (value: number, label?: string) => void;
}

export interface ConvertResult {
  built: BuiltFile;
  outputName: string;
}

async function readBook(params: ConvertParams): Promise<Book> {
  const { file, source, signal, onProgress } = params;
  switch (source) {
    case 'txt':
      return parseTxt(file);
    case 'docx':
      onProgress?.(0.15, '正在解析 DOCX');
      return parseDocx(file, signal);
    case 'epub':
      onProgress?.(0.15, '正在解析 EPUB');
      return parseEpub(file, signal);
    case 'pdf':
      onProgress?.(0.05, '正在解析 PDF');
      return parsePdf(file, signal, (done, total) => {
        onProgress?.(0.05 + 0.5 * (done / Math.max(total, 1)), `正在解析 PDF 第 ${done}/${total} 页`);
      });
  }
}

export async function convert(params: ConvertParams): Promise<ConvertResult> {
  const { target, signal, onProgress } = params;
  const book = await readBook(params);
  signal.throwIfAborted();

  const opts: ConvertOptions = {
    outputName: params.outputName,
    txtEncoding: params.txtEncoding,
    epubTitle: params.epubTitle,
    signal,
    onProgress,
  };

  let built: BuiltFile;
  switch (target) {
    case 'txt':
      built = await buildTxt(book, opts);
      break;
    case 'docx':
      onProgress?.(0.6, '正在生成 DOCX');
      built = await buildDocx(book, opts);
      break;
    case 'epub':
      onProgress?.(0.55, '正在生成 EPUB');
      built = await buildEpub(book, opts);
      break;
    case 'pdf':
      onProgress?.(0.58, '正在生成 PDF');
      built = await buildPdf(book, opts);
      break;
  }
  onProgress?.(1, '完成');
  return { built, outputName: `${params.outputName}.${built.extension}` };
}

/** 提取适合展示的错误摘要 */
export function errorSummary(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') return '已取消转换';
  if (err instanceof Error) {
    const msg = err.message || String(err);
    return msg.length > 80 ? msg.slice(0, 80) + '…' : msg;
  }
  return '未知错误';
}
