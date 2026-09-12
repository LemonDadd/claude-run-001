import { bookFromText } from './textUtils';
import { stripExtension } from './formats';
import type { Book } from './types';

// Vite 把 ?url 转成 worker 文件的静态 URL；Node 直跑（测试脚本）下不走该导入。
type PdfjsModule = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfjsModule> | null = null;

const inBrowser = typeof document !== 'undefined';

async function getPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      if (!inBrowser) {
        // Node 测试环境：legacy 构建自带 fake worker
        const legacy = await import('pdfjs-dist/legacy/build/pdf.mjs');
        return legacy as unknown as PdfjsModule;
      }
      const lib = await import('pdfjs-dist');
      const mod = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')) as unknown as {
        default: string;
      };
      lib.GlobalWorkerOptions.workerSrc = mod.default;
      return lib;
    })();
  }
  return pdfjsPromise;
}

export interface PdfProgress {
  loaded: number;
  total: number;
}

/**
 * 解析文字型 PDF。扫描件/图片 PDF 提取不到文字时会抛出错误提示。
 * Worker 在 main.ts 中配置；未配置时 pdf.js 自动回退到主线程（fake worker）。
 */
export async function parsePdf(
  file: File,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<Book> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdfjsLib = await getPdfjs();
  const task = pdfjsLib.getDocument({
    data,
    isEvalSupported: false,
  });

  const abortHandler = () => task.destroy();
  signal?.addEventListener('abort', abortHandler, { once: true });

  try {
    const pdf = await task.promise;
    signal?.throwIfAborted();

    let title = '';
    try {
      const meta = await pdf.getMetadata();
      const info = meta.info as { Title?: string } | null;
      title = (info?.Title ?? '').trim();
    } catch {
      /* 元数据读取失败可忽略 */
    }

    const pages: string[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      signal?.throwIfAborted();
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      pages.push(extractPageText(content));
      page.cleanup();
      onProgress?.(pageNum, pdf.numPages);
    }

    const fullText = pages
      .map((p) => p.trim())
      .filter(Boolean)
      .join('\n\n');

    if (!fullText.trim()) {
      throw new Error('PDF 中未提取到文字，可能是扫描件/图片版 PDF（暂不支持 OCR）');
    }

    return bookFromText(fullText, title || stripExtension(file.name));
  } finally {
    signal?.removeEventListener('abort', abortHandler);
  }
}

type TextItem = { str: string; hasEOL?: boolean };

function extractPageText(content: { items: Array<TextItem | Record<string, unknown>> }): string {
  let out = '';
  for (const item of content.items) {
    if (!('str' in item)) continue;
    const t = item as TextItem;
    out += t.str;
    if (t.hasEOL) out += '\n';
  }
  return cleanPdfText(out);
}

/**
 * PDF 提取后的清理：
 * 1. 中文字符之间多余的空格去掉；
 * 2. 英文跨行的断词（word-\nhyphen）合并；
 * 3. 3 个以上连续换行压成空行分段。
 */
function cleanPdfText(text: string): string {
  let t = text.replace(/\u00A0/g, ' ');
  // 中-空格-中：反复执行处理连续情况
  for (let i = 0; i < 3; i++) {
    t = t.replace(/([\u4e00-\u9fff])[ \t]+(?=[\u4e00-\u9fff])/g, '$1');
  }
  t = t.replace(/([A-Za-z])-\r?\n([a-z])/g, '$1$2');
  t = t.replace(/[ \t]+\n/g, '\n');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t;
}
