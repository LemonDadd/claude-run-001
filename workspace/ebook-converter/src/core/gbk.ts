/**
 * GBK 编码器：字符串 → GBK 字节流。
 * ASCII 单字节，其余字符查码表得到双字节；查不到的字符用 '?' 替代。
 * 码表以 Base64 文本存放（仅 170KB，且只在选择 GBK 输出时按需下载），
 * 解码为 Uint16Array，下标是 Unicode 码位，值是 GBK 双字节值。
 */

let inflight: Promise<Uint16Array> | null = null;

function loadTable(): Promise<Uint16Array> {
  if (!inflight) {
    inflight = (async () => {
      const url = `${import.meta.env?.BASE_URL ?? '/'}data/gbk-encode.txt`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('GBK 码表加载失败');
      const b64 = (await res.text()).trim();
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      // 用独立的 ArrayBuffer 按小端解析为 Uint16Array
      const ab = new ArrayBuffer(bytes.length);
      new Uint8Array(ab).set(bytes);
      return new Uint16Array(ab);
    })();
    inflight.catch(() => {
      inflight = null;
    });
  }
  return inflight;
}

export async function encodeGbk(text: string): Promise<Uint8Array> {
  const table = await loadTable();
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) {
      out.push(code);
    } else if (code <= 0xffff) {
      const gbk = table[code];
      if (gbk) {
        out.push(gbk >> 8, gbk & 0xff);
      } else {
        out.push(0x3f); // ?
      }
    } else {
      out.push(0x3f); // GBK 以外的扩展字符（emoji 等）
    }
  }
  return new Uint8Array(out);
}
