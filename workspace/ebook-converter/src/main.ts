import './ui/app.css';
import './ui/sw-register';
import {
  detectFormat,
  FORMAT_LABELS,
  legalTargets,
  sanitizeName,
  stripExtension,
} from './core/formats';
import { convert, errorSummary } from './core/converter';
import { addHistory, clearHistory, loadHistory } from './core/history';
import { canShareFile, downloadFile, shareFile } from './core/output';
import type {
  BuiltFile,
  ConvertStatus,
  Format,
  HistoryEntry,
  TxtEncoding,
} from './core/types';

type View = 'pick' | 'options' | 'converting' | 'result';

interface State {
  view: View;
  file: File | null;
  source: Format | null;
  target: Format | null;
  outputName: string;
  txtEncoding: TxtEncoding;
  epubTitle: string;
  detecting: boolean;
  progress: number;
  progressLabel: string;
  abort: AbortController | null;
  result:
    | { status: ConvertStatus; built?: BuiltFile; filename?: string; error?: string }
    | null;
}

const state: State = {
  view: 'pick',
  file: null,
  source: null,
  target: null,
  outputName: '',
  txtEncoding: 'utf-8',
  epubTitle: '',
  detecting: false,
  progress: 0,
  progressLabel: '',
  abort: null,
  result: null,
};

const screenEl = document.getElementById('screen')!;

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.txt,.docx,.epub,.pdf';
fileInput.style.display = 'none';
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) void pickFile(f);
  fileInput.value = '';
});
document.body.appendChild(fileInput);

function render(): void {
  if (state.view === 'pick') renderPick();
  else if (state.view === 'options') renderOptions();
  else if (state.view === 'converting') renderConverting();
  else renderResult();
}

/* ---------------- 选文件 ---------------- */

function renderPick(): void {
  screenEl.innerHTML = `
    <div class="card">
      <div id="pickZone" class="pick-zone" role="button" tabindex="0" aria-label="选择文件">
        <div class="big-icon">📄</div>
        <div class="pick-title">点击选择电子书</div>
        <div class="pick-sub">支持 TXT · DOCX · EPUB · PDF</div>
      </div>
      <p class="muted" style="margin:12px 2px 0">
        所有转换均在本机浏览器完成，文件不会上传。PDF 仅限文字型，扫描件暂不支持。
      </p>
    </div>`;
  const zone = screenEl.querySelector<HTMLElement>('#pickZone')!;
  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });
  zone.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault();
    zone.style.background = '#e0e7ff';
  });
  zone.addEventListener('dragleave', () => {
    zone.style.background = '';
  });
  zone.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    zone.style.background = '';
    const f = e.dataTransfer?.files?.[0];
    if (f) void pickFile(f);
  });
}

async function pickFile(file: File): Promise<void> {
  state.detecting = true;
  state.file = file;
  state.source = null;
  state.target = null;
  state.view = 'options';
  state.result = null;
  state.outputName = stripExtension(file.name);
  state.txtEncoding = 'utf-8';
  state.epubTitle = '';
  renderOptions();

  const fmt = await detectFormat(file);
  if (!fmt) {
    state.detecting = false;
    state.view = 'pick';
    state.file = null;
    render();
    toast('无法识别文件格式，请选择 txt / docx / epub / pdf 文件');
    return;
  }
  state.source = fmt;
  state.target = legalTargets(fmt)[0] ?? null;
  state.detecting = false;
  renderOptions();
}

/* ---------------- 选项 ---------------- */

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function renderOptions(): void {
  const { file, source, target, detecting } = state;
  const targets = source ? legalTargets(source) : [];

  const showTxtEncoding = target === 'txt';
  const encodingLabel = 'TXT 输出编码（旧设备乱码可改选 GBK）';
  const showEpubTitle = target === 'epub';

  screenEl.innerHTML = `
    <div class="steps">
      <span class="dot active"></span><span>选文件</span>
      <span class="dot ${file ? 'active' : ''}"></span><span>选格式</span>
      <span class="dot ${target ? 'active' : ''}"></span><span>转换</span>
    </div>

    <div class="card">
      <h2>① 已选文件</h2>
      <div class="file-meta">
        <div class="file-badge">${source ? FORMAT_LABELS[source] : '…'}</div>
        <div class="file-info">
          <div class="name">${escapeHtml(file?.name ?? '')}</div>
          <div class="sub">
            ${file ? formatSize(file.size) + ' · ' : ''}
            ${detecting ? '正在识别格式…' : source ? `已识别为 ${FORMAT_LABELS[source]}` : ''}
          </div>
        </div>
      </div>
      <button id="repickBtn" class="text-btn" style="padding-left:0;margin-top:8px">重新选择文件</button>
    </div>

    <div class="card" ${source ? '' : 'inert'}>
      <h2>② 选择目标格式</h2>
      <div class="format-grid">
        ${targets
          .map(
            (f) => `
          <button class="format-chip ${f === target ? 'selected' : ''}" data-target="${f}">
            ${FORMAT_LABELS[f]}
            <span class="ext-desc">.${f}</span>
          </button>`,
          )
          .join('')}
      </div>
      <p class="muted" style="margin:10px 2px 0">仅列出与源格式不同的合法组合。</p>
    </div>

    <div class="card" ${target ? '' : 'inert'}>
      <h2>③ 转换选项</h2>
      <div class="field">
        <label for="nameInput">输出文件名</label>
        <input id="nameInput" type="text" value="${escapeHtml(state.outputName)}"
               maxlength="120" autocomplete="off" />
      </div>
      ${
        showTxtEncoding
          ? `
      <div class="field">
        <label>${encodingLabel}</label>
        <div class="segmented" id="encSeg">
          <button data-enc="utf-8" class="${state.txtEncoding === 'utf-8' ? 'active' : ''}">UTF-8（默认）</button>
          <button data-enc="gbk" class="${state.txtEncoding === 'gbk' ? 'active' : ''}">GBK</button>
        </div>
      </div>`
          : ''
      }
      ${
        showEpubTitle
          ? `
      <div class="field">
        <label for="epubTitleInput">EPUB 书名</label>
        <input id="epubTitleInput" type="text" value="${escapeHtml(state.epubTitle)}"
               placeholder="留空则使用源文件书名" autocomplete="off" />
      </div>`
          : ''
      }
    </div>

    <button id="convertBtn" class="btn btn-primary" ${target ? '' : 'disabled'}>
      转换为 ${target ? FORMAT_LABELS[target] : ''}
    </button>`;

  screenEl.querySelector('#repickBtn')?.addEventListener('click', () => {
    Object.assign(state, {
      view: 'pick',
      file: null,
      source: null,
      target: null,
      detecting: false,
      result: null,
    });
    render();
  });

  screenEl.querySelectorAll<HTMLButtonElement>('[data-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.target = btn.dataset.target as Format;
      renderOptions();
    });
  });

  screenEl
    .querySelector<HTMLInputElement>('#nameInput')
    ?.addEventListener('input', (e) => {
      state.outputName = (e.target as HTMLInputElement).value;
    });

  screenEl
    .querySelector<HTMLInputElement>('#epubTitleInput')
    ?.addEventListener('input', (e) => {
      state.epubTitle = (e.target as HTMLInputElement).value;
    });

  screenEl.querySelectorAll('#encSeg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.txtEncoding = (btn as HTMLElement).dataset.enc as TxtEncoding;
      renderOptions();
    });
  });

  screenEl.querySelector('#convertBtn')?.addEventListener('click', startConvert);
}

/* ---------------- 转换中 ---------------- */

function renderConverting(): void {
  screenEl.innerHTML = `
    <div class="card progress-wrap">
      <div class="big-icon" style="font-size:40px">⚙️</div>
      <div class="progress-label" id="progressLabel">${escapeHtml(state.progressLabel || '准备中…')}</div>
      <div class="progress-bar"><div id="progressBar"></div></div>
      <div class="progress-percent" id="progressPercent">0%</div>
      <button id="cancelBtn" class="btn btn-danger" style="margin-top:22px">取消转换</button>
    </div>`;
  updateProgress(state.progress);
  screenEl.querySelector('#cancelBtn')?.addEventListener('click', () => {
    state.abort?.abort();
    const btn = screenEl.querySelector<HTMLButtonElement>('#cancelBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '正在取消…';
    }
  });
}

function updateProgress(value: number): void {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const bar = screenEl.querySelector<HTMLElement>('#progressBar');
  const text = screenEl.querySelector('#progressPercent');
  if (bar) bar.style.width = `${pct}%`;
  if (text) text.textContent = `${pct}%`;
}

async function startConvert(): Promise<void> {
  if (!state.file || !state.source || !state.target) return;
  const outputName = sanitizeName(state.outputName, stripExtension(state.file.name));
  const abort = new AbortController();
  state.abort = abort;
  state.progress = 0;
  state.progressLabel = '准备中…';
  state.view = 'converting';
  state.result = null;
  renderConverting();

  let status: ConvertStatus;
  let result: State['result'];

  try {
    const { built, outputName: finalName } = await convert({
      file: state.file,
      source: state.source,
      target: state.target,
      txtEncoding: state.txtEncoding,
      outputName,
      epubTitle: state.epubTitle || undefined,
      signal: abort.signal,
      onProgress: (value, label) => {
        state.progress = value;
        if (label) {
          state.progressLabel = label;
          screenEl.querySelector('#progressLabel')?.replaceChildren(document.createTextNode(label));
        }
        updateProgress(value);
      },
    });
    status = 'success';
    result = { status, built, filename: finalName };
  } catch (err) {
    if (abort.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      status = 'cancelled';
      result = { status, error: '用户取消了转换' };
    } else {
      status = 'failed';
      result = { status, error: errorSummary(err) };
    }
  }

  state.result = result;
  state.abort = null;

  addHistory({
    name: `${outputName}.${state.target}`,
    path: `来源：${state.file.name}（${FORMAT_LABELS[state.source]} → ${FORMAT_LABELS[state.target]}）`,
    status,
    error: status === 'success' ? undefined : result.error ?? '转换失败',
  });

  state.view = 'result';
  renderResult();
}

/* ---------------- 结果 ---------------- */

function renderResult(): void {
  const r = state.result;
  if (!r) return;

  if (r.status === 'success' && r.built && r.filename) {
    screenEl.innerHTML = `
      <div class="card">
        <div class="result-icon">✅</div>
        <div class="result-title status-success">转换成功</div>
        <div class="result-sub">${escapeHtml(r.filename)} · ${formatSize(r.built.bytes.length)}</div>
        <div style="margin-top:18px;display:flex;flex-direction:column;gap:10px">
          ${
            canShareFile()
              ? '<button id="shareBtn" class="btn btn-primary">📤 分享</button>'
              : ''
          }
          <button id="saveBtn" class="btn ${canShareFile() ? 'btn-outline' : 'btn-primary'}">💾 保存到手机</button>
          <button id="againBtn" class="btn btn-outline" style="border-color:var(--border);color:var(--text)">继续转换</button>
        </div>
        <p class="muted" style="margin-top:14px;text-align:center">
          保存失败时可改用「分享 → 保存到文件」
        </p>
      </div>`;

    screenEl.querySelector('#shareBtn')?.addEventListener('click', async () => {
      try {
        const out = await shareFile(r.built!.bytes, r.filename!, r.built!.mime);
        if (out === 'unsupported') toast('当前浏览器不支持系统分享，请使用保存');
      } catch (err) {
        toast('分享失败：' + errorSummary(err));
      }
    });
    screenEl.querySelector('#saveBtn')?.addEventListener('click', () => {
      downloadFile(r.built!.bytes, r.filename!, r.built!.mime);
      toast('已开始下载');
    });
  } else {
    const isCancelled = r.status === 'cancelled';
    screenEl.innerHTML = `
      <div class="card">
        <div class="result-icon">${isCancelled ? '🚫' : '⚠️'}</div>
        <div class="result-title ${isCancelled ? '' : 'status-error'}">
          ${isCancelled ? '已取消转换' : '转换失败'}
        </div>
        <div class="error-box">${escapeHtml(r.error ?? '未知错误')}</div>
        ${
          !isCancelled
            ? `<p class="muted" style="margin-top:12px">提示：请确认文件未损坏、未加密；扫描版 PDF / 纯图片文档暂不支持。</p>`
            : ''
        }
        <div class="btn-row" style="margin-top:18px">
          <button id="backOptsBtn" class="btn btn-outline">返回修改</button>
          ${
            isCancelled
              ? ''
              : '<button id="retryBtn" class="btn btn-primary">重试</button>'
          }
        </div>
      </div>`;
    screenEl.querySelector('#backOptsBtn')?.addEventListener('click', () => {
      state.view = state.file ? 'options' : 'pick';
      render();
    });
    screenEl.querySelector('#retryBtn')?.addEventListener('click', () => startConvert());
  }

  screenEl.querySelector('#againBtn')?.addEventListener('click', resetAll);
}

function resetAll(): void {
  Object.assign(state, {
    view: 'pick',
    file: null,
    source: null,
    target: null,
    outputName: '',
    epubTitle: '',
    progress: 0,
    result: null,
  });
  render();
}

/* ---------------- 历史抽屉 ---------------- */

const drawer = document.getElementById('historyDrawer')!;

function openHistory(): void {
  renderHistoryList();
  drawer.hidden = false;
}

function closeHistory(): void {
  drawer.hidden = true;
}

function renderHistoryList(): void {
  const listEl = document.getElementById('historyList')!;
  const list = loadHistory();
  if (list.length === 0) {
    listEl.innerHTML = '<div class="empty">还没有转换记录</div>';
    return;
  }
  listEl.innerHTML = list.map(historyItemHtml).join('');
}

function historyItemHtml(h: HistoryEntry): string {
  const labelMap: Record<ConvertStatus, string> = {
    success: '成功',
    failed: '失败',
    cancelled: '已取消',
  };
  return `
    <div class="history-item">
      <div class="h-top">
        <span class="tag tag-${h.status}">${labelMap[h.status]}</span>
        <span class="h-name">${escapeHtml(h.name)}</span>
      </div>
      <div class="h-path">${escapeHtml(h.path)}</div>
      ${h.error ? `<div class="h-err">${escapeHtml(h.error)}</div>` : ''}
      <div class="h-time">${formatTime(h.time)}</div>
    </div>`;
}

function formatTime(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

document.getElementById('historyBtn')?.addEventListener('click', openHistory);
document.getElementById('clearHistoryBtn')?.addEventListener('click', () => {
  clearHistory();
  renderHistoryList();
  toast('历史已清空');
});
drawer.querySelectorAll('[data-close-drawer]').forEach((el) =>
  el.addEventListener('click', closeHistory),
);

/* ---------------- 工具 ---------------- */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer: number | undefined;
function toast(message: string): void {
  const el = document.getElementById('toast')!;
  el.textContent = message;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.hidden = true;
  }, 2600);
}

render();
