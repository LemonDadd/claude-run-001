import { bookToText } from './textUtils';
import { FORMAT_MIMES } from './formats';
import { encodeGbk } from './gbk';
import type { Book, BuiltFile, ConvertOptions } from './types';

export async function buildTxt(book: Book, opts: ConvertOptions): Promise<BuiltFile> {
  const text = bookToText(book);
  if (opts.txtEncoding === 'gbk') {
    opts.onProgress?.(0.8, '正在以 GBK 编码');
    const bytes = await encodeGbk(text);
    return { bytes, mime: 'text/plain;charset=gbk', extension: 'txt' };
  }
  // UTF-8 带 BOM，手机端阅读器兼容性更好
  opts.onProgress?.(0.85, '正在生成 TXT');
  const body = new TextEncoder().encode(text);
  const bytes = new Uint8Array(body.length + 3);
  bytes.set([0xef, 0xbb, 0xbf], 0);
  bytes.set(body, 3);
  return { bytes, mime: FORMAT_MIMES.txt, extension: 'txt' };
}
