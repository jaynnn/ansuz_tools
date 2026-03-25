import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/DocViewer.css';

/* ═══════════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════════ */

function getExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

type FileCategory = 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'docx' | 'excel' | 'unknown';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'avif']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'aac', 'flac', 'wma', 'm4a']);
const TEXT_EXTS = new Set([
  'txt', 'md', 'json', 'xml', 'csv', 'log', 'yml', 'yaml', 'ini', 'conf',
  'sh', 'bat', 'cmd', 'ps1', 'html', 'htm', 'css', 'js', 'ts', 'jsx', 'tsx',
  'py', 'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs', 'rb', 'php', 'sql',
  'swift', 'kt', 'scala', 'r', 'lua', 'pl', 'toml', 'env', 'gitignore',
]);
// Only .xlsx is supported; legacy .xls (BIFF binary) is not a ZIP archive and
// cannot be loaded by ExcelJS, so it is intentionally excluded here.
const EXCEL_EXTS = new Set(['xlsx']);

function categorize(name: string, mime: string): FileCategory {
  const ext = getExtension(name);
  console.log(`[DocViewer] categorize: name="${name}" ext="${ext}" mime="${mime}"`);
  let result: FileCategory;
  if (IMAGE_EXTS.has(ext) || mime.startsWith('image/')) result = 'image';
  else if (ext === 'pdf' || mime === 'application/pdf') result = 'pdf';
  else if (VIDEO_EXTS.has(ext) || mime.startsWith('video/')) result = 'video';
  else if (AUDIO_EXTS.has(ext) || mime.startsWith('audio/')) result = 'audio';
  else if (ext === 'docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') result = 'docx';
  else if (EXCEL_EXTS.has(ext) || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') result = 'excel';
  else if (TEXT_EXTS.has(ext) || mime.startsWith('text/')) result = 'text';
  else result = 'unknown';
  console.log(`[DocViewer] categorize result: "${result}"${result === 'unknown' ? ` (ext="${ext}" mime="${mime}" not matched by any supported category)` : ''}`);
  return result;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Excel data types
   ═══════════════════════════════════════════════════════════════════════════ */
interface SheetData {
  name: string;
  rows: string[][];
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════════ */

const ExcelPreview: React.FC<{ sheets: SheetData[] }> = ({ sheets }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const sheet = sheets[activeIdx];
  if (!sheet) return null;

  return (
    <div className="dv-excel-preview">
      {sheets.length > 1 && (
        <div className="dv-excel-tabs">
          {sheets.map((s, i) => (
            <button
              key={i}
              className={`dv-excel-tab${i === activeIdx ? ' active' : ''}`}
              onClick={() => setActiveIdx(i)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="dv-excel-table-wrapper">
        <table className="dv-excel-table">
          {sheet.rows.length > 0 && (
            <>
              <thead>
                <tr>
                  {sheet.rows[0].map((cell, ci) => (
                    <th key={ci}>{cell}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.slice(1).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </table>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   Main DocViewer component
   ═══════════════════════════════════════════════════════════════════════════ */

const DocViewer: React.FC = () => {
  const navigate = useNavigate();

  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [category, setCategory] = useState<FileCategory | null>(null);

  // Rendered content holders
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [excelSheets, setExcelSheets] = useState<SheetData[] | null>(null);

  const docxContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentFileRef = useRef<File | null>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    document.title = '文档查看器';
  }, []);

  // Cleanup object URL on unmount or file change
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  /* ─── Reset state ─────────────────────────────────────────────────────── */
  const resetState = useCallback(() => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setFileName('');
    setCategory(null);
    setObjectUrl(null);
    setTextContent(null);
    setExcelSheets(null);
    setLoading(false);
    currentFileRef.current = null;
  }, [objectUrl]);

  /* ─── Process the selected file ───────────────────────────────────────── */
  const processFile = useCallback(async (file: File) => {
    console.log(`[DocViewer] processFile: name="${file.name}" size=${file.size} type="${file.type}"`);
    resetState();
    setLoading(true);
    setFileName(file.name);
    currentFileRef.current = file;

    const cat = categorize(file.name, file.type);
    setCategory(cat);
    console.log(`[DocViewer] starting preview, category="${cat}"`);

    try {
      switch (cat) {
        case 'image':
        case 'pdf':
        case 'video':
        case 'audio': {
          const url = URL.createObjectURL(file);
          setObjectUrl(url);
          break;
        }

        case 'text': {
          const text = await file.text();
          setTextContent(text);
          break;
        }

        case 'docx': {
          const { renderAsync } = await import('docx-preview');
          // Need to wait for ref to be available after state update
          await new Promise<void>((resolve, reject) => {
            let attempts = 0;
            const check = () => {
              if (docxContainerRef.current) {
                resolve();
              } else if (++attempts > 100) {
                reject(new Error('docx container ref not available'));
              } else {
                requestAnimationFrame(check);
              }
            };
            check();
          });
          if (docxContainerRef.current) {
            docxContainerRef.current.innerHTML = '';
            const buf = await file.arrayBuffer();
            await renderAsync(buf, docxContainerRef.current);
          }
          break;
        }

        case 'excel': {
          const ExcelJS = await import('exceljs');
          const workbook = new ExcelJS.Workbook();
          const buf = await file.arrayBuffer();
          await workbook.xlsx.load(buf);

          const sheets: SheetData[] = [];
          workbook.eachSheet((worksheet) => {
            const rows: string[][] = [];
            worksheet.eachRow({ includeEmpty: false }, (row) => {
              const cells: string[] = [];
              row.eachCell({ includeEmpty: true }, (cell) => {
                cells.push(cell.text ?? String(cell.value ?? ''));
              });
              rows.push(cells);
            });
            // Normalise column count
            const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
            for (const row of rows) {
              while (row.length < maxCols) row.push('');
            }
            sheets.push({ name: worksheet.name, rows });
          });
          setExcelSheets(sheets);
          break;
        }

        default:
          // unknown – just show file info
          console.warn(`[DocViewer] unsupported format: ext="${getExtension(file.name)}" mime="${file.type}" – showing fallback UI`);
          break;
      }
    } catch (err) {
      console.error('[DocViewer] Failed to preview file:', err);
      setCategory('unknown');
    } finally {
      setLoading(false);
    }
  }, [resetState]);

  /* ─── Drag-and-drop handlers ──────────────────────────────────────────── */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) processFile(files[0]);
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) processFile(files[0]);
    // Reset so the same file can be re-selected
    e.target.value = '';
  }, [processFile]);

  /* ─── Render preview ──────────────────────────────────────────────────── */
  const renderPreview = () => {
    if (loading) return <div className="dv-loading">正在解析文件…</div>;
    if (!category) return null;

    switch (category) {
      case 'image':
        return objectUrl ? <img className="dv-image-preview" src={objectUrl} alt={fileName} /> : null;

      case 'pdf':
        return objectUrl ? <iframe className="dv-pdf-preview" src={objectUrl} title={fileName} /> : null;

      case 'video':
        return objectUrl ? <video className="dv-video-preview" src={objectUrl} controls /> : null;

      case 'audio':
        return objectUrl ? (
          <div className="dv-audio-wrapper">
            <audio className="dv-audio-preview" src={objectUrl} controls />
          </div>
        ) : null;

      case 'text':
        return textContent !== null ? (
          <div className="dv-text-preview">
            <pre>{textContent}</pre>
          </div>
        ) : null;

      case 'docx':
        return <div className="dv-docx-preview" ref={docxContainerRef} />;

      case 'excel':
        return excelSheets ? <ExcelPreview sheets={excelSheets} /> : null;

      default: {
        const ext = getExtension(fileName);
        let hint = '暂不支持预览该文件格式';
        if (ext === 'xls') {
          hint = '.xls 为旧版 Excel 二进制格式，暂不支持预览，请将文件另存为 .xlsx 后重新上传';
        } else if (ext === 'doc') {
          hint = '.doc 为旧版 Word 二进制格式，暂不支持预览，请将文件另存为 .docx 后重新上传';
        }
        const handleDownload = () => {
          const file = currentFileRef.current;
          if (!file) return;
          const url = URL.createObjectURL(file);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 100);
        };
        return (
          <div className="dv-unsupported">
            <span className="dv-unsupported-icon">📄</span>
            <span className="dv-unsupported-name">{fileName}</span>
            <span className="dv-unsupported-hint">{hint}</span>
            {currentFileRef.current && (
              <button className="dv-download-btn" onClick={handleDownload}>
                下载文件
              </button>
            )}
          </div>
        );
      }
    }
  };

  /* ─── Main render ─────────────────────────────────────────────────────── */
  return (
    <div className="dv-page">
      <div className="dv-header">
        <button className="dv-back-btn" onClick={() => navigate('/')}>← 返回</button>
        <h1>{fileName || '文档查看器'}</h1>
        {fileName && (
          <button className="dv-clear-btn" onClick={resetState}>
            清除
          </button>
        )}
      </div>

      <div
        className="dv-body"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {!category && !loading ? (
          <div
            className={`dv-dropzone${dragging ? ' dv-dragging' : ''}`}
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="dv-drop-icon">📂</span>
            <span className="dv-drop-title">拖拽文件到此处</span>
            <span className="dv-drop-hint">
              或点击选择文件 · 支持 PDF、Word (.docx)、Excel (.xlsx)、图片、视频、音频、文本等格式（不支持 .doc/.xls 旧版格式）
            </span>
            <input
              ref={fileInputRef}
              className="dv-hidden-input"
              type="file"
              onChange={handleFileInput}
            />
          </div>
        ) : (
          <div className="dv-preview">
            {renderPreview()}
          </div>
        )}
      </div>
    </div>
  );
};

export default DocViewer;
