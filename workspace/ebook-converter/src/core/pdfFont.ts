/**
 * 懒加载内嵌中文字体（Droid Sans Fallback，Apache-2.0），
 * 仅在生成 PDF 时下载，Base64 缓存在内存中，供多个 jsPDF 实例使用。
 */

let cachedBase64: string | null = null;
let inflight: Promise<string> | null = null;

const FONT_URL = `${import.meta.env?.BASE_URL ?? '/'}fonts/DroidSansFallback.ttf`;
export const FONT_FAMILY = 'DroidSansFallback';
export const FONT_FILE = 'DroidSansFallback.ttf';

export function loadCjkFont(): Promise<string> {
  if (cachedBase64) return Promise.resolve(cachedBase64);
  if (!inflight) {
    inflight = (async () => {
      const res = await fetch(FONT_URL);
      if (!res.ok) throw new Error(`中文字体加载失败（HTTP ${res.status}）`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const b64 = bytesToBase64(bytes);
      cachedBase64 = b64;
      return b64;
    })();
    inflight.catch(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** 分块 Base64，避免 String.fromCharCode 超大参数爆栈 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
