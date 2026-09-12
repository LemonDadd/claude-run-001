import { bookFromText } from './textUtils';
import { stripExtension } from './formats';
import type { Book } from './types';

/**
 * 自动检测 TXT 编码：
 * 1. UTF-8/UTF-16 BOM 直接判定；
 * 2. 先按 UTF-8 严格解码，出现非法序列则回退 GBK。
 */
export function decodeTxtBytes(bytes: Uint8Array): string {
  // UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes);
  }
  // UTF-16 LE/BE BOM
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes);
  }
  // 无 BOM：先严格试 UTF-8
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // 非法 UTF-8 序列 → 按 GBK 解码
    return new TextDecoder('gbk').decode(bytes);
  }
}

/**
 * 解析 TXT：输入编码自动检测（BOM / 严格 UTF-8 / GBK 回退）。
 * 输出编码由界面选项单独控制。
 */
export async function parseTxt(file: File): Promise<Book> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = decodeTxtBytes(bytes);
  if (!text.trim()) {
    throw new Error('TXT 内容为空，无法转换');
  }
  return bookFromText(text, stripExtension(file.name));
}
