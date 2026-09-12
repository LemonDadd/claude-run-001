// 生成 Unicode 码位 -> GBK 双字节 编码表
// 输出 Uint16Array（小端），下标为 Unicode 码位，0 表示 GBK 不支持
import iconv from 'iconv-lite';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('public/data', { recursive: true });

const table = new Uint16Array(0x10000);

for (let hi = 0x81; hi <= 0xfe; hi++) {
  for (let lo = 0x40; lo <= 0xfe; lo++) {
    if (lo === 0x7f) continue;
    const buf = Buffer.from([hi, lo]);
    const decoded = iconv.decode(buf, 'gbk');
    if ([...decoded].length !== 1) continue; // 未定义区域
    const cp = decoded.codePointAt(0);
    if (cp >= 0x80 && cp <= 0xffff && table[cp] === 0) {
      table[cp] = (hi << 8) | lo; // 下标 = Unicode 码位
    }
  }
}

const bin = Buffer.from(table.buffer);
writeFileSync('public/data/gbk-encode.txt', bin.toString('base64'));
console.log('entries:', [...table].filter(Boolean).length);

// 自检
const sample = '中文测试，汪淼觉得：Chapter 1';
const bytes = [];
for (const ch of sample) {
  const cp = ch.codePointAt(0);
  if (cp < 0x80) bytes.push(cp);
  else { const v = table[cp]; bytes.push(v >> 8, v & 0xff); }
}
const back = iconv.decode(Buffer.from(bytes), 'gbk');
console.log('roundtrip ok:', back === sample, '->', back);
if (back !== sample) process.exit(1);
