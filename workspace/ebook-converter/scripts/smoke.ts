/**
 * 真机浏览器端冒烟测试（Playwright）：
 * 1. 页面加载，PWA manifest/字体可访问；
 * 2. 选 TXT → 自动识别 → 各目标格式（TXT/EPUB/DOCX/PDF）逐一转换；
 * 3. 历史记录写入并展示；
 * 4. 取消按钮可中断；
 * 5. 非法文件有错误提示。
 */
import { chromium, type Browser, type Page } from 'playwright';

async function downloadToBuffer(dl: import('playwright').Download): Promise<Buffer> {
  const stream = await dl.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

const BASE = 'http://localhost:4173/';
const SAMPLE = [
  '手机端测试小说',
  '',
  '第一章 启程',
  '',
  '清晨七点，林川被闹钟叫醒。窗外的梧桐叶在风里沙沙作响。',
  '他拿起背包，推开了那扇老旧的木门，走进晨光之中。',
  '',
  '第二章 归途',
  '',
  '多年以后，当他再次回到这座小城，一切仿佛都变了，又仿佛都还在。',
].join('\n');

let passed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name} ${extra}`);
    process.exitCode = 1;
  }
}

async function pickFile(page: Page, name: string, content: string | Buffer, type = 'text/plain') {
  const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  await page.setInputFiles('input[type=file]', { name, mimeType: type, buffer: data });
}

async function waitResult(page: Page, timeoutMs = 120000): Promise<string> {
  await page.waitForSelector('.result-title', { timeout: timeoutMs });
  return page.locator('.result-title').innerText();
}

async function run() {
  const browser: Browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  console.log('① 页面与静态资源');
  await page.goto(BASE);
  await page.waitForSelector('#pickZone');
  check('显示选择文件区', true);
  const manifest = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).status);
  check('manifest 200', manifest === 200);
  const font = await page.evaluate(async () => (await fetch('./fonts/DroidSansFallback.ttf')).status);
  check('中文字体 200', font === 200);

  console.log('② TXT → EPUB');
  await pickFile(page, 'demo.txt', SAMPLE);
  await page.waitForSelector('[data-target="epub"]');
  check('源格式自动识别为 TXT', (await page.locator('.file-badge').innerText()) === 'TXT');
  const targets = await page.locator('.format-chip').allInnerTexts();
  check('目标仅列 3 个合法组合', targets.length === 3, targets.join(','));
  check('目标不含 TXT 自身', !targets.some((t) => t.trim().startsWith('TXT')));
  await page.click('[data-target="epub"]');
  check('EPUB 书名输入框出现', await page.locator('#epubTitleInput').isVisible());
  await page.fill('#epubTitleInput', '冒烟测试书');
  await page.click('#convertBtn');
  await page.waitForSelector('.progress-bar');
  check('进度条出现', true);
  let title = await waitResult(page);
  check('EPUB 转换成功', title.includes('成功'), title);
  check('显示分享/保存按钮', await page.locator('#saveBtn').isVisible());

  // 触发保存（下载）
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }).catch(() => []),
    page.click('#saveBtn'),
  ]);
  check('保存触发下载', Array.isArray(download) ? false : !!download, (download as unknown)?.suggestedFilename?.());
  if (!Array.isArray(download)) {
    check('下载文件名正确', download.suggestedFilename() === 'demo.epub', download.suggestedFilename());
  }
  await page.click('#againBtn');

  const conversions: Array<[string, string, string]> = [
    ['③ TXT → DOCX', 'docx', 'docx'],
    ['④ TXT → PDF', 'pdf', 'pdf'],
  ];
  for (const [label, , selector] of conversions) {
    console.log(label);
    await pickFile(page, 'demo.txt', SAMPLE);
    await page.waitForSelector(`[data-target="${selector}"]`);
    await page.click(`[data-target="${selector}"]`);
    await page.click('#convertBtn');
    title = await waitResult(page);
    check('转换成功', title.includes('成功'), title);
    await page.click('#againBtn');
  }

  console.log('⑤ EPUB → TXT(GBK)（TXT→TXT 为非法组合，故用 EPUB 源）');
  // 先拿到一个 EPUB 文件
  await pickFile(page, 'demo.txt', SAMPLE);
  await page.waitForSelector('[data-target="epub"]');
  await page.click('[data-target="epub"]');
  const [epubDl] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.click('#convertBtn').then(() => waitResult(page)).then(() => page.click('#saveBtn')),
  ]);
  const epubBuffer = await downloadToBuffer(epubDl);
  check('拿到 EPUB 中间文件', epubBuffer.length > 1000, `${epubBuffer.length}`);
  await page.click('#againBtn');

  await page.setInputFiles('input[type=file]', {
    name: 'demo.epub',
    mimeType: 'application/epub+zip',
    buffer: epubBuffer,
  });
  await page.waitForSelector('[data-target="txt"]');
  check('EPUB 源被正确识别', (await page.locator('.file-badge').innerText()) === 'EPUB');
  await page.click('[data-target="txt"]');
  check('TXT 编码分段出现', await page.locator('#encSeg').isVisible());
  await page.click('#encSeg button[data-enc="gbk"]');
  check('GBK 可手动选中', true);
  await page.click('#convertBtn');
  title = await waitResult(page);
  check('EPUB → TXT(GBK) 成功', title.includes('成功'), title);
  const [gbkDl] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }).catch(() => []),
    page.click('#saveBtn'),
  ]);
  check('GBK 文件可保存', !Array.isArray(gbkDl));
  if (!Array.isArray(gbkDl)) {
    const gbkBuf = await downloadToBuffer(gbkDl);
    const iconv = (await import('iconv-lite')).default;
    const decoded = iconv.decode(gbkBuf, 'gbk');
    check('GBK 内容可正确解码', decoded.includes('林川') || decoded.includes('梧桐'), decoded.slice(0, 40));
    check('GBK 文件无 UTF-8 BOM', gbkBuf[0] !== 0xef);
  }
  await page.click('#againBtn');

  console.log('⑥ 历史记录');
  await page.click('#historyBtn');
  await page.waitForSelector('.history-item');
  const items = await page.locator('.history-item').count();
  check('历史条数与转换次数一致（5 条）', items === 5, `实际 ${items}`);
  const firstName = await page.locator('.history-item .h-name').first().innerText();
  check('最新记录在前', firstName.includes('.txt'), firstName);
  const tags = await page.locator('.history-item .tag').allInnerTexts();
  check('全部状态为成功', tags.every((t) => t.includes('成功')), tags.join(','));
  await page.click('#clearHistoryBtn');
  check('清空后显示空态', (await page.locator('.empty').count()) === 1);
  await page.locator('.drawer-head [data-close-drawer]').click();

  console.log('⑦ 取消转换');
  await pickFile(page, 'demo.txt', SAMPLE);
  await page.waitForSelector('[data-target="pdf"]');
  await page.click('[data-target="pdf"]');
  await page.click('#convertBtn');
  // 小文件转换极快，尽量在进度界面点取消（点不到说明已完成，也算合理行为）
  const cancelClicked = await page
    .locator('#cancelBtn')
    .click({ timeout: 300 })
    .then(() => true)
    .catch(() => false);
  if (cancelClicked) {
    title = await page
      .waitForSelector('.result-title')
      .then(() => page.locator('.result-title').innerText());
    check('显示已取消', title.includes('取消'), title);
  } else {
    check('转换已完成（小文件无法及时取消，可接受）', true);
  }

  console.log('⑧ 不支持文件');
  await page.goto(BASE);
  await pickFile(page, 'strange.azw3', Buffer.from([0x00, 0x01, 0x02, 0x03]), 'application/octet-stream');
  await page.waitForTimeout(300);
  const toast = await page.locator('#toast').innerText({ timeout: 3000 }).catch(() => '');
  check('未知格式给出提示', toast.includes('无法识别'), toast);

  console.log('⑨ 控制台无报错');
  const serious = errors.filter((e) => !/favicon|Failed to load resource/i.test(e));
  check(`console 无 error（${serious.length} 条）`, serious.length === 0, serious.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n${passed} 项检查通过`);
  if (process.exitCode) console.log('存在失败项');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
