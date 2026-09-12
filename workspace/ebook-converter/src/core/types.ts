export type Format = 'txt' | 'docx' | 'epub' | 'pdf';

export interface Chapter {
  title: string;
  paragraphs: string[];
}

export interface Book {
  title: string;
  chapters: Chapter[];
}

export type TxtEncoding = 'utf-8' | 'gbk';

export interface ConvertOptions {
  /** 输出文件名（不含扩展名） */
  outputName: string;
  /** TXT 输出编码，默认 UTF-8，可手动选 GBK */
  txtEncoding: TxtEncoding;
  /** EPUB 书名 */
  epubTitle?: string;
  signal: AbortSignal;
  onProgress?: (value: number, label?: string) => void;
}

export interface BuiltFile {
  bytes: Uint8Array;
  mime: string;
  extension: Format;
}

export type ConvertStatus = 'success' | 'failed' | 'cancelled';

export interface HistoryEntry {
  id: string;
  /** 输出文件名 */
  name: string;
  /** 来源描述（浏览器拿不到真实路径，记录来源文件名） */
  path: string;
  status: ConvertStatus;
  time: number;
  /** 错误摘要 */
  error?: string;
}
