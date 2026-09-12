import { bookFromText } from './textUtils';
import { stripExtension } from './formats';
import type { Book } from './types';

export async function parseDocx(file: File, signal?: AbortSignal): Promise<Book> {
  const arrayBuffer = await file.arrayBuffer();
  signal?.throwIfAborted();
  const mammoth = await import('mammoth');

  // 浏览器构建接收 { arrayBuffer }；Node CJS 构建接收 { buffer }。
  const input =
    typeof document === 'undefined'
      ? { buffer: Buffer.from(arrayBuffer) }
      : { arrayBuffer };

  const result = await mammoth.extractRawText(input);
  if (!result.value.trim()) {
    throw new Error('DOCX 中未提取到文字（图片型文档不支持）');
  }
  return bookFromText(result.value, stripExtension(file.name));
}
