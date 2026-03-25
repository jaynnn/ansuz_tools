import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
// .xlsx uses ExcelJS; legacy .xls (BIFF8 binary) is handled via @e965/xlsx.
const EXCEL_EXTS = new Set(['xlsx', 'xls']);

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5;

function categorize(name: string, mime: string): FileCategory {
  const ext = getExtension(name);
  if (import.meta.env.DEV) console.log(`[DocViewer] categorize: name="${name}" ext="${ext}" mime="${mime}"`);
  let result: FileCategory;
  if (IMAGE_EXTS.has(ext) || mime.startsWith('image/')) result = 'image';
  else if (ext === 'pdf' || mime === 'application/pdf') result = 'pdf';
  else if (VIDEO_EXTS.has(ext) || mime.startsWith('video/')) result = 'video';
  else if (AUDIO_EXTS.has(ext) || mime.startsWith('audio/')) result = 'audio';
  else if (ext === 'docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') result = 'docx';
  else if (EXCEL_EXTS.has(ext) || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || mime === 'application/vnd.ms-excel') result = 'excel';
  else if (TEXT_EXTS.has(ext) || mime.startsWith('text/')) result = 'text';
  else result = 'unknown';
  if (import.meta.env.DEV) console.log(`[DocViewer] categorize result: "${result}"${result === 'unknown' ? ` (ext="${ext}" mime="${mime}" not matched by any supported category)` : ''}`);
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

/* ─── Text preview with search ───────────────────────────────────────────── */
const TextPreview: React.FC<{ content: string }> = ({ content }) => {
  const [searchText, setSearchText] = useState('');

  const matchCount = useMemo(() => {
    const q = searchText.trim();
    if (!q) return 0;
    const lower = q.toLowerCase();
    const contentLower = content.toLowerCase();
    let count = 0;
    let idx = 0;
    while ((idx = contentLower.indexOf(lower, idx)) !== -1) {
      count++;
      idx += lower.length;
    }
    return count;
  }, [content, searchText]);

  const highlightedContent = useMemo((): React.ReactNode[] | null => {
    const q = searchText.trim();
    if (!q) return null;
    const lower = q.toLowerCase();
    const lowerContent = content.toLowerCase();
    const result: React.ReactNode[] = [];
    let lastIdx = 0;
    let key = 0;
    let idx = 0;
    while ((idx = lowerContent.indexOf(lower, lastIdx)) !== -1) {
      if (idx > lastIdx) result.push(content.slice(lastIdx, idx));
      result.push(<mark key={key++}>{content.slice(idx, idx + q.length)}</mark>);
      lastIdx = idx + q.length;
    }
    if (lastIdx < content.length) result.push(content.slice(lastIdx));
    return result;
  }, [content, searchText]);

  return (
    <div className="dv-text-preview">
      <div className="dv-text-toolbar">
        <input
          className="dv-text-search"
          type="text"
          placeholder="🔍 搜索…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        {searchText.trim() && (
          <span className={`dv-text-match-count${matchCount === 0 ? ' no-match' : ''}`}>
            {matchCount > 0 ? `${matchCount} 处匹配` : '无匹配'}
          </span>
        )}
      </div>
      <pre>{highlightedContent !== null ? highlightedContent : content}</pre>
    </div>
  );
};

/* ─── Excel preview with filtering / sorting ─────────────────────────────── */
const ExcelPreview: React.FC<{ sheets: SheetData[] }> = ({ sheets }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [colFilters, setColFilters] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ col: number; dir: 'asc' | 'desc' } | null>(null);

  const sheet = sheets[activeIdx];

  const headers = sheet?.rows[0] ?? [];

  const handleTabClick = (i: number) => {
    setActiveIdx(i);
    setSearchText('');
    setColFilters([]);
    setSortConfig(null);
  };

  const filtered = useMemo(() => {
    if (!sheet) return [];
    const rows = sheet.rows.slice(1);
    return rows.filter((row) => {
      if (searchText.trim()) {
        const lower = searchText.toLowerCase();
        if (!row.some((cell) => cell.toLowerCase().includes(lower))) return false;
      }
      for (let i = 0; i < colFilters.length; i++) {
        const f = colFilters[i];
        if (f && !(row[i] ?? '').toLowerCase().includes(f.toLowerCase())) return false;
      }
      return true;
    });
  }, [sheet, searchText, colFilters]);

  const sorted = useMemo(() => {
    if (!sortConfig) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortConfig.col] ?? '';
      const bv = b[sortConfig.col] ?? '';
      const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
      return sortConfig.dir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortConfig]);

  const toggleSort = (col: number) => {
    setSortConfig((prev) => {
      if (!prev || prev.col !== col) return { col, dir: 'asc' };
      if (prev.dir === 'asc') return { col, dir: 'desc' };
      return null;
    });
  };

  const updateColFilter = (ci: number, val: string) => {
    setColFilters((prev) => {
      const next = [...prev];
      next[ci] = val;
      return next;
    });
  };

  const handleClearFilters = () => {
    setSearchText('');
    setColFilters([]);
    setSortConfig(null);
  };

  if (!sheet) return null;

  const hasFilters = !!searchText.trim() || colFilters.some((f) => f);
  const totalRows = sheet.rows.length > 0 ? sheet.rows.length - 1 : 0;
  const shownRows = sorted.length;

  return (
    <div className="dv-excel-preview">
      {sheets.length > 1 && (
        <div className="dv-excel-tabs">
          {sheets.map((s, i) => (
            <button
              key={i}
              className={`dv-excel-tab${i === activeIdx ? ' active' : ''}`}
              onClick={() => handleTabClick(i)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="dv-excel-toolbar">
        <input
          className="dv-excel-search"
          type="text"
          placeholder="🔍 搜索全表…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        {hasFilters && (
          <button
            className="dv-excel-clear-filters"
            onClick={handleClearFilters}
          >
            清除筛选
          </button>
        )}
        <span className="dv-excel-row-count">
          {hasFilters ? `${shownRows} / ${totalRows} 行` : `共 ${totalRows} 行`}
        </span>
      </div>

      <div className="dv-excel-table-wrapper">
        <table className="dv-excel-table">
          {sheet.rows.length > 0 && (
            <>
              <thead>
                <tr>
                  <th className="dv-excel-rownum">#</th>
                  {headers.map((cell, ci) => (
                    <th
                      key={ci}
                      className="dv-excel-sortable-th"
                      onClick={() => toggleSort(ci)}
                      title="点击排序"
                    >
                      <span className="dv-excel-col-name">{cell}</span>
                      <span className="dv-excel-sort-icon">
                        {sortConfig?.col === ci
                          ? sortConfig.dir === 'asc' ? '↑' : '↓'
                          : '⇅'}
                      </span>
                    </th>
                  ))}
                </tr>
                <tr className="dv-excel-filter-row">
                  <th className="dv-excel-rownum"></th>
                  {headers.map((_, ci) => (
                    <th key={ci}>
                      <input
                        className="dv-excel-col-filter"
                        type="text"
                        placeholder="筛选…"
                        value={colFilters[ci] ?? ''}
                        onChange={(e) => updateColFilter(ci, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, ri) => (
                  <tr key={ri}>
                    <td className="dv-excel-rownum">{ri + 1}</td>
                    {row.map((cell, ci) => (
                      <td key={ci}>{cell}</td>
                    ))}
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={headers.length + 1} className="dv-excel-no-results">
                      无匹配结果
                    </td>
                  </tr>
                )}
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

  // Image zoom state
  const [imageScale, setImageScale] = useState(1);
  const [imgRenderedSize, setImgRenderedSize] = useState<{ w: number; h: number } | null>(null);

  const docxContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
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
    setImageScale(1);
    setImgRenderedSize(null);
    setLoading(false);
    currentFileRef.current = null;
  }, [objectUrl]);

  /* ─── Process the selected file ───────────────────────────────────────── */
  const processFile = useCallback(async (file: File) => {
    if (import.meta.env.DEV) console.log(`[DocViewer] processFile: name="${file.name}" size=${file.size} type="${file.type}"`);
    resetState();
    setLoading(true);
    setFileName(file.name);
    currentFileRef.current = file;

    const cat = categorize(file.name, file.type);
    setCategory(cat);
    if (import.meta.env.DEV) console.log(`[DocViewer] starting preview, category="${cat}"`);

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
          const ext = getExtension(file.name);
          const sheets: SheetData[] = [];

          if (ext === 'xls') {
            // Legacy BIFF8 binary format: use @e965/xlsx (safe SheetJS fork)
            const XLSX = await import('@e965/xlsx');
            const buf = await file.arrayBuffer();
            const workbook = XLSX.read(new Uint8Array(buf), { type: 'array' });
            for (const sheetName of workbook.SheetNames) {
              const ws = workbook.Sheets[sheetName];
              const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
              const rows: string[][] = raw.map((r) =>
                (r as unknown[]).map((c) => (c === null || c === undefined ? '' : String(c)))
              );
              const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
              for (const row of rows) {
                while (row.length < maxCols) row.push('');
              }
              sheets.push({ name: sheetName, rows });
            }
          } else {
            // Modern OOXML format (.xlsx): use ExcelJS
            const ExcelJS = await import('exceljs');
            const workbook = new ExcelJS.Workbook();
            const buf = await file.arrayBuffer();
            await workbook.xlsx.load(buf);
            workbook.eachSheet((worksheet) => {
              const rows: string[][] = [];
              worksheet.eachRow({ includeEmpty: false }, (row) => {
                const cells: string[] = [];
                row.eachCell({ includeEmpty: true }, (cell) => {
                  cells.push(cell.text ?? String(cell.value ?? ''));
                });
                rows.push(cells);
              });
              const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
              for (const row of rows) {
                while (row.length < maxCols) row.push('');
              }
              sheets.push({ name: worksheet.name, rows });
            });
          }

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

  const handleImageLoad = useCallback(() => {
    if (imgRef.current) {
      setImgRenderedSize({ w: imgRef.current.offsetWidth, h: imgRef.current.offsetHeight });
    }
  }, []);

  /* ─── Render preview ──────────────────────────────────────────────────── */
  const renderPreview = () => {
    if (loading) return <div className="dv-loading">正在解析文件…</div>;
    if (!category) return null;

    switch (category) {
      case 'image':
        return objectUrl ? (
          <div className="dv-image-zoom-wrapper">
            <div className="dv-image-zoom-toolbar">
              <button
                className="dv-zoom-btn"
                onClick={() => setImageScale((s) => Math.max(ZOOM_MIN, +(s - ZOOM_STEP).toFixed(2)))}
              >
                −
              </button>
              <span className="dv-zoom-label">{Math.round(imageScale * 100)}%</span>
              <button
                className="dv-zoom-btn"
                onClick={() => setImageScale((s) => Math.min(ZOOM_MAX, +(s + ZOOM_STEP).toFixed(2)))}
              >
                +
              </button>
              <button className="dv-zoom-btn" onClick={() => setImageScale(1)}>重置</button>
            </div>
            <div className={`dv-image-scroll-area${imageScale !== 1 ? ' zoomed' : ''}`}>
              <div
                style={
                  imageScale !== 1 && imgRenderedSize
                    ? {
                        width: imgRenderedSize.w * imageScale,
                        height: imgRenderedSize.h * imageScale,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        flexShrink: 0,
                      }
                    : {}
                }
              >
                <img
                  ref={imgRef}
                  className="dv-image-preview"
                  src={objectUrl}
                  alt={fileName}
                  onLoad={handleImageLoad}
                  style={
                    imageScale !== 1 && imgRenderedSize
                      ? { width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none', objectFit: 'contain', padding: 0 }
                      : {}
                  }
                />
              </div>
            </div>
          </div>
        ) : null;

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
        return textContent !== null ? <TextPreview content={textContent} /> : null;

      case 'docx':
        return <div className="dv-docx-preview" ref={docxContainerRef} />;

      case 'excel':
        return excelSheets ? <ExcelPreview sheets={excelSheets} /> : null;

      default: {
        const ext = getExtension(fileName);
        let hint = '暂不支持预览该文件格式';
        if (ext === 'doc') {
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
              或点击选择文件 · 支持 PDF、Word (.docx)、Excel (.xlsx/.xls)、图片、视频、音频、文本等格式（不支持 .doc 旧版格式）
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
