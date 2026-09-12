# 📖 电子书格式转换器（手机端 PWA）

在手机浏览器中完成 **TXT · DOCX · EPUB · PDF** 四种格式相互转换，**全部本地处理，文件不上传**。

## 功能流程

选文件 → 自动识别格式（文件头魔数 + 扩展名回退）→ 选目标格式（只列出 3 个合法组合）
→ 可选：输出文件名 / TXT 输出编码（UTF-8 默认，手动 GBK）/ EPUB 书名
→ 转换（进度条 + 可随时取消）→ 分享或保存 → 写入本地历史（最近 20 条）

历史记录字段：文件名、来源路径描述、状态（成功/失败/已取消）、时间、错误摘要。

## 支持矩阵

| 源 \ 目标 | TXT | DOCX | EPUB | PDF |
| ---------- | :-: | :--: | :--: | :-: |
| **TXT**    | —（仅转码） | ✅ | ✅ | ✅ |
| **DOCX**   | ✅ | — | ✅ | ✅ |
| **EPUB**   | ✅ | ✅ | — | ✅ |
| **PDF**    | ✅ | ✅ | ✅ | — |

> PDF 仅限**文字型 PDF**；扫描件/纯图片 PDF 无法提取文字（暂不支持 OCR）。

## 技术说明

- **框架**：Vite + TypeScript，无 UI 框架，移动端优先响应式布局
- **解析**：mammoth（DOCX）、JSZip + DOMParser（EPUB 2/3）、pdf.js（PDF，Web Worker）
- **生成**：原生文本（TXT）、docx（DOCX）、JSZip（EPUB 3）、jsPDF + Droid Sans Fallback 嵌入字体（PDF）
- **编码**：输入 TXT 自动检测（BOM / 严格 UTF-8 回退 GBK）；GBK 输出查表（按需加载 170KB 码表）
- **离线**：Service Worker 缓存，可“添加到主屏幕”作为 App 使用
- **输出**：Web Share API（系统分享面板）/ 浏览器下载保存
- **隐私**：所有转换在浏览器内完成，无任何网络上传

## 开发

```bash
npm install
npm run dev        # 本地开发（手机同网段可访问 http://<电脑IP>:5173）
npm run build      # 类型检查 + 生产构建到 dist/
npm run preview    # 预览生产构建
npm test           # 单元 + 集成测试（Vitest，18 个用例）
```

### 重新生成 GBK 码表

```bash
npm run build:gbk  # 依赖开发期 iconv-lite，输出 public/data/gbk-encode.txt
```

## 目录结构

```
src/
  core/            转换核心（与 UI 解耦，可独立测试）
    formats.ts       格式识别 / 合法组合
    parse*.ts        四种格式解析为统一 Book 模型
    build*.ts        Book 模型导出为四种格式
    converter.ts     编排：解析 → 生成，进度与取消
    history.ts       localStorage 历史（最多 20 条）
    gbk.ts           GBK 编码（码表按需加载）
  ui/               样式与 Service Worker 注册
  main.ts           界面状态机：选文件 / 选项 / 转换中 / 结果
public/
  fonts/             内嵌中文字体（Apache-2.0，AOSP）
  data/              GBK 编码表（Base64）
scripts/             GBK 码表生成、浏览器冒烟脚本
test/                Vitest 测试
```

## 浏览器兼容

- iOS Safari 15+ / Android Chrome 90+
- “分享”需要系统支持 Web Share Level 2（文件分享）；不支持时仅显示“保存”。

## 许可

本项目代码 MIT；内置字体 [Droid Sans Fallback](https://android.googlesource.com/platform/frameworks/base/+/oreo-release/data/fonts/DroidSansFallback.ttf) 采用 Apache License 2.0。
