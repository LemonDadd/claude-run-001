export function downloadFile(bytes: Uint8Array, filename: string, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function canShareFile(): boolean {
  return typeof navigator.canShare === 'function' &&
    typeof navigator.share === 'function';
}

/** 调用系统分享（微信/QQ/蓝牙/保存到文件等由系统提供） */
export async function shareFile(
  bytes: Uint8Array,
  filename: string,
  mime: string,
): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (!canShareFile()) return 'unsupported';
  const file = new File([bytes as BlobPart], filename, { type: mime });
  if (!navigator.canShare({ files: [file] })) return 'unsupported';
  try {
    await navigator.share({ files: [file], title: filename });
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    throw err;
  }
}
