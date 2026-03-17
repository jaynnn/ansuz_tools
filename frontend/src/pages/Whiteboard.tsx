import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { whiteboardAPI } from '../api';
import type {
  WhiteboardElement,
  WhiteboardAppState,
  WhiteboardDocSummary,
  WhiteboardElementType,
} from '../types/index';
import '../styles/Whiteboard.css';

/* ═══════════════════════════════════════════════════════════════════════════
   Constants & helpers
   ═══════════════════════════════════════════════════════════════════════════ */

const DEFAULT_STROKE = '#000000';
const DEFAULT_BG = 'transparent';
const DEFAULT_STROKE_WIDTH = 2;
const HANDLE_SIZE = 8;
const MIN_DIMENSION = 2;

let nextId = 0;
function genId(): string {
  return `el_${Date.now()}_${nextId++}`;
}

/** Deep-clone an array of elements (snapshot for undo) */
function cloneElements(els: WhiteboardElement[]): WhiteboardElement[] {
  return els.map(e => ({
    ...e,
    points: e.points ? e.points.map(p => [...p]) : undefined,
  }));
}

/* ─── Coordinate transforms ─────────────────────────────────────────────── */

function screenToWorld(
  sx: number, sy: number,
  zoom: number, offsetX: number, offsetY: number,
): [number, number] {
  return [(sx - offsetX) / zoom, (sy - offsetY) / zoom];
}

function worldToScreen(
  wx: number, wy: number,
  zoom: number, offsetX: number, offsetY: number,
): [number, number] {
  return [wx * zoom + offsetX, wy * zoom + offsetY];
}

/* ─── Hit testing ──────────────────────────────────────────────────────── */

function pointInRect(px: number, py: number, el: WhiteboardElement, threshold = 4): boolean {
  const minX = Math.min(el.x, el.x + el.width);
  const maxX = Math.max(el.x, el.x + el.width);
  const minY = Math.min(el.y, el.y + el.height);
  const maxY = Math.max(el.y, el.y + el.height);
  return px >= minX - threshold && px <= maxX + threshold &&
         py >= minY - threshold && py <= maxY + threshold;
}

function pointInEllipse(px: number, py: number, el: WhiteboardElement, threshold = 4): boolean {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rx = Math.abs(el.width) / 2 + threshold;
  const ry = Math.abs(el.height) / 2 + threshold;
  if (rx === 0 || ry === 0) return false;
  return ((px - cx) ** 2) / (rx ** 2) + ((py - cy) ** 2) / (ry ** 2) <= 1;
}

function distPointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function pointOnArrow(px: number, py: number, el: WhiteboardElement, threshold = 6): boolean {
  if (!el.points || el.points.length < 2) return false;
  for (let i = 0; i < el.points.length - 1; i++) {
    if (distPointToSegment(px, py, el.points[i][0], el.points[i][1], el.points[i + 1][0], el.points[i + 1][1]) < threshold) {
      return true;
    }
  }
  return false;
}

function pointOnFreeDraw(px: number, py: number, el: WhiteboardElement, threshold = 6): boolean {
  if (!el.points || el.points.length === 0) return false;
  // Quick bounding-box check first
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of el.points) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  if (px < minX - threshold || px > maxX + threshold || py < minY - threshold || py > maxY + threshold) return false;
  for (let i = 0; i < el.points.length - 1; i++) {
    if (distPointToSegment(px, py, el.points[i][0], el.points[i][1], el.points[i + 1][0], el.points[i + 1][1]) < threshold) {
      return true;
    }
  }
  return false;
}

function hitTest(px: number, py: number, el: WhiteboardElement): boolean {
  switch (el.type) {
    case 'rectangle': return pointInRect(px, py, el);
    case 'ellipse': return pointInEllipse(px, py, el);
    case 'arrow': return pointOnArrow(px, py, el);
    case 'free_draw': return pointOnFreeDraw(px, py, el);
    case 'text': return pointInRect(px, py, el);
    default: return false;
  }
}

/** Hit test from back to front, return topmost hit index or -1 */
function hitTestAll(px: number, py: number, elements: WhiteboardElement[]): number {
  for (let i = elements.length - 1; i >= 0; i--) {
    if (hitTest(px, py, elements[i])) return i;
  }
  return -1;
}

/* ─── Resize handle detection ──────────────────────────────────────────── */
type HandlePos = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

function getHandlePositions(el: WhiteboardElement): { pos: HandlePos; x: number; y: number }[] {
  const { x, y, width: w, height: h } = el;
  return [
    { pos: 'nw', x, y },
    { pos: 'n', x: x + w / 2, y },
    { pos: 'ne', x: x + w, y },
    { pos: 'e', x: x + w, y: y + h / 2 },
    { pos: 'se', x: x + w, y: y + h },
    { pos: 's', x: x + w / 2, y: y + h },
    { pos: 'sw', x, y: y + h },
    { pos: 'w', x, y: y + h / 2 },
  ];
}

function hitTestHandle(px: number, py: number, el: WhiteboardElement, zoom: number): HandlePos | null {
  const threshold = HANDLE_SIZE / zoom;
  for (const h of getHandlePositions(el)) {
    if (Math.abs(px - h.x) <= threshold && Math.abs(py - h.y) <= threshold) return h.pos;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Renderer
   ═══════════════════════════════════════════════════════════════════════════ */

function renderScene(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  elements: WhiteboardElement[],
  selectedIds: Set<string>,
  zoom: number,
  offsetX: number,
  offsetY: number,
  dpr: number,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Apply camera transform
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(zoom, zoom);

  for (const el of elements) {
    ctx.save();
    drawElement(ctx, el);
    ctx.restore();

    // Selection highlight
    if (selectedIds.has(el.id)) {
      ctx.save();
      ctx.strokeStyle = '#4a90d9';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      if (el.type === 'free_draw' || el.type === 'arrow') {
        // Bounding box around path
        if (el.points && el.points.length > 0) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const p of el.points) {
            if (p[0] < minX) minX = p[0];
            if (p[0] > maxX) maxX = p[0];
            if (p[1] < minY) minY = p[1];
            if (p[1] > maxY) maxY = p[1];
          }
          ctx.strokeRect(minX - 4, minY - 4, maxX - minX + 8, maxY - minY + 8);
        }
      } else {
        ctx.strokeRect(el.x - 4, el.y - 4, el.width + 8, el.height + 8);
      }
      ctx.setLineDash([]);

      // Resize handles (only for rect/ellipse/text)
      if (el.type !== 'free_draw' && el.type !== 'arrow') {
        for (const h of getHandlePositions(el)) {
          const hs = HANDLE_SIZE / zoom;
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#4a90d9';
          ctx.lineWidth = 1.5 / zoom;
          ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
          ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
        }
      }
      ctx.restore();
    }
  }

  ctx.restore();
}

function drawElement(ctx: CanvasRenderingContext2D, el: WhiteboardElement) {
  ctx.strokeStyle = el.strokeColor;
  ctx.lineWidth = el.strokeWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (el.type) {
    case 'rectangle': {
      if (el.backgroundColor !== 'transparent') {
        ctx.fillStyle = el.backgroundColor;
        ctx.fillRect(el.x, el.y, el.width, el.height);
      }
      ctx.strokeRect(el.x, el.y, el.width, el.height);
      break;
    }
    case 'ellipse': {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const rx = Math.abs(el.width) / 2;
      const ry = Math.abs(el.height) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (el.backgroundColor !== 'transparent') {
        ctx.fillStyle = el.backgroundColor;
        ctx.fill();
      }
      ctx.stroke();
      break;
    }
    case 'arrow': {
      if (!el.points || el.points.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(el.points[0][0], el.points[0][1]);
      for (let i = 1; i < el.points.length; i++) {
        ctx.lineTo(el.points[i][0], el.points[i][1]);
      }
      ctx.stroke();
      // Arrowhead
      const last = el.points[el.points.length - 1];
      const prev = el.points[el.points.length - 2];
      const angle = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
      const headLen = 12;
      ctx.beginPath();
      ctx.moveTo(last[0], last[1]);
      ctx.lineTo(last[0] - headLen * Math.cos(angle - Math.PI / 6), last[1] - headLen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(last[0], last[1]);
      ctx.lineTo(last[0] - headLen * Math.cos(angle + Math.PI / 6), last[1] - headLen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
      break;
    }
    case 'free_draw': {
      if (!el.points || el.points.length === 0) break;
      ctx.beginPath();
      ctx.moveTo(el.points[0][0], el.points[0][1]);
      for (let i = 1; i < el.points.length; i++) {
        ctx.lineTo(el.points[i][0], el.points[i][1]);
      }
      ctx.stroke();
      break;
    }
    case 'text': {
      if (el.backgroundColor !== 'transparent') {
        ctx.fillStyle = el.backgroundColor;
        ctx.fillRect(el.x, el.y, el.width, el.height);
      }
      ctx.strokeRect(el.x, el.y, el.width, el.height);
      if (el.text) {
        const fontSize = Math.max(14, Math.min(el.height - 8, 200));
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = el.strokeColor;
        ctx.textBaseline = 'middle';
        ctx.fillText(el.text, el.x + 4, el.y + el.height / 2, el.width - 8);
      }
      break;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   Interaction state machine
   ═══════════════════════════════════════════════════════════════════════════ */

type InteractionMode =
  | 'idle'
  | 'drawing'
  | 'selecting'
  | 'dragging'
  | 'resizing'
  | 'panning';

/* ═══════════════════════════════════════════════════════════════════════════
   Free-draw down-sampling
   ═══════════════════════════════════════════════════════════════════════════ */
function downsamplePoints(pts: number[][], minDist = 3): number[][] {
  if (pts.length <= 2) return pts;
  const result = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = result[result.length - 1];
    if (Math.hypot(pts[i][0] - prev[0], pts[i][1] - prev[1]) >= minDist) {
      result.push(pts[i]);
    }
  }
  result.push(pts[pts.length - 1]);
  return result;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════════════════════════════════ */

const Whiteboard: React.FC = () => {
  const navigate = useNavigate();

  /* ─── View: document list vs editor ────────────────────────────────── */
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [documents, setDocuments] = useState<WhiteboardDocSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  /* ─── Editor state ─────────────────────────────────────────────────── */
  const [docId, setDocId] = useState<string | null>(null);
  const [docName, setDocName] = useState('');
  const [elements, setElements] = useState<WhiteboardElement[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [appState, setAppState] = useState<WhiteboardAppState>({ zoom: 1, offsetX: 0, offsetY: 0 });
  const [version, setVersion] = useState(1);
  const [activeTool, setActiveTool] = useState<WhiteboardElementType | 'select' | 'pan'>('select');
  const [strokeColor, setStrokeColor] = useState(DEFAULT_STROKE);
  const [bgColor, setBgColor] = useState(DEFAULT_BG);
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH);
  const [editingText, setEditingText] = useState<string | null>(null);

  /* ─── Refs ─────────────────────────────────────────────────────────── */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<InteractionMode>('idle');
  const elementsRef = useRef(elements);
  const appStateRef = useRef(appState);
  const activeToolRef = useRef(activeTool);
  const selectedIdsRef = useRef(selectedIds);
  const drawingElRef = useRef<WhiteboardElement | null>(null);
  const dragStartRef = useRef<{ wx: number; wy: number; origElements: WhiteboardElement[] } | null>(null);
  const resizeRef = useRef<{ handle: HandlePos; origEl: WhiteboardElement; startWx: number; startWy: number } | null>(null);
  const panStartRef = useRef<{ sx: number; sy: number; origOffsetX: number; origOffsetY: number } | null>(null);
  const dirtyRef = useRef(false);
  const rafRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionRef = useRef(version);
  const docIdRef = useRef(docId);

  /* ─── History (snapshot-based) ─────────────────────────────────────── */
  const historyRef = useRef<WhiteboardElement[][]>([]);
  const futureRef = useRef<WhiteboardElement[][]>([]);

  /* Keep refs in sync */
  useEffect(() => { elementsRef.current = elements; }, [elements]);
  useEffect(() => { appStateRef.current = appState; }, [appState]);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { versionRef.current = version; }, [version]);
  useEffect(() => { docIdRef.current = docId; }, [docId]);

  /* ─── Document list ────────────────────────────────────────────────── */
  const fetchDocuments = useCallback(async () => {
    setLoadingList(true);
    try {
      const data = await whiteboardAPI.listDocuments();
      setDocuments(data.documents);
    } catch { /* ignore */ }
    setLoadingList(false);
  }, []);

  useEffect(() => {
    document.title = '白板 - 工具箱';
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      try {
        const data = await whiteboardAPI.listDocuments();
        if (!cancelled) setDocuments(data.documents);
      } catch { /* ignore */ }
      if (!cancelled) setLoadingList(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleCreateDoc = async () => {
    try {
      const { document: doc } = await whiteboardAPI.createDocument();
      openDocument(doc.docId);
    } catch (err) {
      console.error('Create whiteboard failed', err);
    }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!window.confirm('确定要删除这个白板吗？')) return;
    try {
      await whiteboardAPI.deleteDocument(id);
      setDocuments(prev => prev.filter(d => d.docId !== id));
    } catch (err) {
      console.error('Delete whiteboard failed', err);
    }
  };

  /* ─── Open document → editor ───────────────────────────────────────── */
  const openDocument = async (id: string) => {
    try {
      const { document: doc } = await whiteboardAPI.getDocument(id);
      setDocId(doc.docId);
      setDocName(doc.name);
      setElements(doc.elements || []);
      setAppState(doc.appState || { zoom: 1, offsetX: 0, offsetY: 0 });
      setVersion(doc.version);
      setSelectedIds(new Set());
      historyRef.current = [cloneElements(doc.elements || [])];
      futureRef.current = [];
      dirtyRef.current = false;
      setView('editor');
    } catch (err) {
      console.error('Open whiteboard failed', err);
    }
  };

  /* ─── Persistence ──────────────────────────────────────────────────── */
  const saveToServer = useCallback(async () => {
    const id = docIdRef.current;
    if (!id || !dirtyRef.current) return;
    dirtyRef.current = false;
    try {
      const res = await whiteboardAPI.updateDocument(id, {
        elements: elementsRef.current,
        appState: appStateRef.current,
        version: versionRef.current,
      });
      setVersion(res.document.version);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const resp = (err as { response?: { status?: number } }).response;
        if (resp?.status === 409) {
          alert('文档版本冲突，将重新加载。');
          if (id) openDocument(id);
          return;
        }
      }
      console.error('Save whiteboard failed', err);
      dirtyRef.current = true; // retry next time
    }
  }, []);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(saveToServer, 500);
  }, [saveToServer]);

  // Save on unload
  useEffect(() => {
    const handler = () => { if (dirtyRef.current) saveToServer(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveToServer]);

  /* ─── History helpers ──────────────────────────────────────────────── */
  const pushHistory = useCallback((newElements: WhiteboardElement[]) => {
    historyRef.current.push(cloneElements(newElements));
    futureRef.current = []; // new action clears redo
    if (historyRef.current.length > 100) historyRef.current.shift();
  }, []);

  const undo = useCallback(() => {
    if (historyRef.current.length <= 1) return;
    const current = historyRef.current.pop()!;
    futureRef.current.push(current);
    const prev = historyRef.current[historyRef.current.length - 1];
    const restored = cloneElements(prev);
    setElements(restored);
    setSelectedIds(new Set());
    scheduleSave();
  }, [scheduleSave]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current.pop()!;
    historyRef.current.push(next);
    const restored = cloneElements(next);
    setElements(restored);
    setSelectedIds(new Set());
    scheduleSave();
  }, [scheduleSave]);

  /* ─── Keyboard shortcuts ───────────────────────────────────────────── */
  useEffect(() => {
    if (view !== 'editor') return;
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when editing text input
      if (editingText) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIdsRef.current.size > 0) {
          e.preventDefault();
          const newEls = elementsRef.current.filter(el => !selectedIdsRef.current.has(el.id));
          setElements(newEls);
          setSelectedIds(new Set());
          pushHistory(newEls);
          scheduleSave();
        }
      } else if (e.key === 'Escape') {
        setSelectedIds(new Set());
        setActiveTool('select');
      } else if (e.key === 'v' || e.key === '1') {
        setActiveTool('select');
      } else if (e.key === 'r' || e.key === '2') {
        setActiveTool('rectangle');
      } else if (e.key === 'o' || e.key === '3') {
        setActiveTool('ellipse');
      } else if (e.key === 'a' || e.key === '4') {
        setActiveTool('arrow');
      } else if (e.key === 'p' || e.key === '5') {
        setActiveTool('free_draw');
      } else if (e.key === 't' || e.key === '6') {
        setActiveTool('text');
      } else if (e.key === 'h' || e.key === '0') {
        setActiveTool('pan');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [view, editingText, undo, redo, pushHistory, scheduleSave]);

  /* ─── Canvas setup & render loop ───────────────────────────────────── */
  useEffect(() => {
    if (view !== 'editor') return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();
    window.addEventListener('resize', resize);

    const loop = () => {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const rect = container.getBoundingClientRect();
        renderScene(
          ctx, rect.width, rect.height,
          elementsRef.current, selectedIdsRef.current,
          appStateRef.current.zoom, appStateRef.current.offsetX, appStateRef.current.offsetY,
          dpr,
        );
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [view]);

  /* ─── Pointer handlers ─────────────────────────────────────────────── */
  const getWorldPos = useCallback((e: React.PointerEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    return screenToWorld(sx, sy, appStateRef.current.zoom, appStateRef.current.offsetX, appStateRef.current.offsetY);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const tool = activeToolRef.current;
    const [wx, wy] = getWorldPos(e);

    // Middle-click or pan tool → panning
    if (e.button === 1 || tool === 'pan') {
      modeRef.current = 'panning';
      panStartRef.current = {
        sx: e.clientX, sy: e.clientY,
        origOffsetX: appStateRef.current.offsetX, origOffsetY: appStateRef.current.offsetY,
      };
      return;
    }

    if (tool === 'select') {
      // Check resize handle first
      for (const id of selectedIdsRef.current) {
        const el = elementsRef.current.find(e => e.id === id);
        if (el && el.type !== 'free_draw' && el.type !== 'arrow') {
          const handle = hitTestHandle(wx, wy, el, appStateRef.current.zoom);
          if (handle) {
            modeRef.current = 'resizing';
            resizeRef.current = { handle, origEl: { ...el }, startWx: wx, startWy: wy };
            return;
          }
        }
      }

      // Then hit test
      const idx = hitTestAll(wx, wy, elementsRef.current);
      if (idx >= 0) {
        const el = elementsRef.current[idx];
        setSelectedIds(new Set([el.id]));
        modeRef.current = 'dragging';
        dragStartRef.current = {
          wx, wy,
          origElements: cloneElements(elementsRef.current),
        };
      } else {
        setSelectedIds(new Set());
        modeRef.current = 'idle';
      }
      return;
    }

    // Drawing tools
    if (tool === 'rectangle' || tool === 'ellipse') {
      const newEl: WhiteboardElement = {
        id: genId(), type: tool,
        x: wx, y: wy, width: 0, height: 0, angle: 0,
        strokeColor, backgroundColor: bgColor, strokeWidth,
      };
      drawingElRef.current = newEl;
      setElements([...elementsRef.current, newEl]);
      modeRef.current = 'drawing';
      return;
    }

    if (tool === 'arrow') {
      const newEl: WhiteboardElement = {
        id: genId(), type: 'arrow',
        x: wx, y: wy, width: 0, height: 0, angle: 0,
        strokeColor, backgroundColor: DEFAULT_BG, strokeWidth,
        points: [[wx, wy]],
      };
      drawingElRef.current = newEl;
      setElements([...elementsRef.current, newEl]);
      modeRef.current = 'drawing';
      return;
    }

    if (tool === 'free_draw') {
      const newEl: WhiteboardElement = {
        id: genId(), type: 'free_draw',
        x: wx, y: wy, width: 0, height: 0, angle: 0,
        strokeColor, backgroundColor: DEFAULT_BG, strokeWidth,
        points: [[wx, wy]],
      };
      drawingElRef.current = newEl;
      setElements([...elementsRef.current, newEl]);
      modeRef.current = 'drawing';
      return;
    }

    if (tool === 'text') {
      const newEl: WhiteboardElement = {
        id: genId(), type: 'text',
        x: wx, y: wy, width: 150, height: 36, angle: 0,
        strokeColor, backgroundColor: bgColor, strokeWidth,
        text: '',
      };
      const newEls = [...elementsRef.current, newEl];
      setElements(newEls);
      setSelectedIds(new Set([newEl.id]));
      setEditingText(newEl.id);
      pushHistory(newEls);
      scheduleSave();
      return;
    }
  }, [strokeColor, bgColor, strokeWidth, getWorldPos, pushHistory, scheduleSave]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const mode = modeRef.current;
    if (mode === 'idle') return;

    if (mode === 'panning') {
      const ps = panStartRef.current!;
      const dx = e.clientX - ps.sx;
      const dy = e.clientY - ps.sy;
      const newState = { ...appStateRef.current, offsetX: ps.origOffsetX + dx, offsetY: ps.origOffsetY + dy };
      appStateRef.current = newState;
      setAppState(newState);
      return;
    }

    const [wx, wy] = getWorldPos(e);

    if (mode === 'drawing') {
      const el = drawingElRef.current;
      if (!el) return;

      if (el.type === 'rectangle' || el.type === 'ellipse') {
        el.width = wx - el.x;
        el.height = wy - el.y;
        // Update in-place for performance; React re-render driven by rAF
        elementsRef.current = elementsRef.current.map(e => e.id === el.id ? { ...el } : e);
      } else if (el.type === 'arrow' || el.type === 'free_draw') {
        el.points = [...(el.points || []), [wx, wy]];
        elementsRef.current = elementsRef.current.map(e => e.id === el.id ? { ...el } : e);
      }
      return;
    }

    if (mode === 'dragging') {
      const ds = dragStartRef.current!;
      const dx = wx - ds.wx;
      const dy = wy - ds.wy;
      const ids = selectedIdsRef.current;
      const newEls = ds.origElements.map(el => {
        if (!ids.has(el.id)) return el;
        const moved = { ...el, x: el.x + dx, y: el.y + dy };
        if (moved.points) {
          moved.points = el.points!.map(p => [p[0] + dx, p[1] + dy]);
        }
        return moved;
      });
      elementsRef.current = newEls;
      return;
    }

    if (mode === 'resizing') {
      const rs = resizeRef.current!;
      const { handle, origEl, startWx, startWy } = rs;
      const dx = wx - startWx;
      const dy = wy - startWy;
      let { x, y, width, height } = origEl;

      // Apply resize based on handle
      if (handle.includes('w')) { x += dx; width -= dx; }
      if (handle.includes('e')) { width += dx; }
      if (handle.includes('n')) { y += dy; height -= dy; }
      if (handle.includes('s')) { height += dy; }

      const updated = { ...origEl, x, y, width, height };
      elementsRef.current = elementsRef.current.map(e => e.id === origEl.id ? updated : e);
      return;
    }
  }, [getWorldPos]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (canvas) canvas.releasePointerCapture(e.pointerId);

    const mode = modeRef.current;

    if (mode === 'drawing') {
      const el = drawingElRef.current;
      if (el) {
        // Normalize negative dimensions
        if ((el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'text') && (el.width < 0 || el.height < 0)) {
          if (el.width < 0) { el.x += el.width; el.width = -el.width; }
          if (el.height < 0) { el.y += el.height; el.height = -el.height; }
        }
        // Ensure minimum size for shapes
        if ((el.type === 'rectangle' || el.type === 'ellipse') && Math.abs(el.width) < MIN_DIMENSION && Math.abs(el.height) < MIN_DIMENSION) {
          // Too small, remove
          elementsRef.current = elementsRef.current.filter(e => e.id !== el.id);
          setElements(elementsRef.current);
        } else {
          // Downsample free-draw points
          if (el.type === 'free_draw' && el.points) {
            el.points = downsamplePoints(el.points);
          }
          elementsRef.current = elementsRef.current.map(e => e.id === el.id ? { ...el } : e);
          setElements([...elementsRef.current]);
          pushHistory(elementsRef.current);
          scheduleSave();
        }
      }
      drawingElRef.current = null;
    }

    if (mode === 'dragging') {
      setElements([...elementsRef.current]);
      pushHistory(elementsRef.current);
      scheduleSave();
      dragStartRef.current = null;
    }

    if (mode === 'resizing') {
      // Normalize negative dimensions after resize
      const rs = resizeRef.current;
      if (rs) {
        const el = elementsRef.current.find(e => e.id === rs.origEl.id);
        if (el && (el.width < 0 || el.height < 0)) {
          const fixed = { ...el };
          if (fixed.width < 0) { fixed.x += fixed.width; fixed.width = -fixed.width; }
          if (fixed.height < 0) { fixed.y += fixed.height; fixed.height = -fixed.height; }
          elementsRef.current = elementsRef.current.map(e => e.id === fixed.id ? fixed : e);
        }
      }
      setElements([...elementsRef.current]);
      pushHistory(elementsRef.current);
      scheduleSave();
      resizeRef.current = null;
    }

    if (mode === 'panning') {
      scheduleSave();
      panStartRef.current = null;
    }

    modeRef.current = 'idle';
  }, [pushHistory, scheduleSave]);

  /* ─── Zoom via scroll ──────────────────────────────────────────────── */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const oldZoom = appStateRef.current.zoom;
    const newZoom = Math.max(0.1, Math.min(10, oldZoom * factor));

    // Zoom towards cursor
    const newOffsetX = sx - (sx - appStateRef.current.offsetX) * (newZoom / oldZoom);
    const newOffsetY = sy - (sy - appStateRef.current.offsetY) * (newZoom / oldZoom);

    const newState = { zoom: newZoom, offsetX: newOffsetX, offsetY: newOffsetY };
    appStateRef.current = newState;
    setAppState(newState);
  }, []);

  /* ─── Text editing ─────────────────────────────────────────────────── */
  const handleTextChange = useCallback((elId: string, text: string) => {
    const newEls = elementsRef.current.map(e => e.id === elId ? { ...e, text } : e);
    elementsRef.current = newEls;
    setElements(newEls);
  }, []);

  const finishTextEditing = useCallback(() => {
    if (editingText) {
      const el = elementsRef.current.find(e => e.id === editingText);
      if (el && !el.text) {
        // Remove empty text element
        const newEls = elementsRef.current.filter(e => e.id !== editingText);
        setElements(newEls);
        elementsRef.current = newEls;
      }
      pushHistory(elementsRef.current);
      scheduleSave();
      setEditingText(null);
    }
  }, [editingText, pushHistory, scheduleSave]);

  /* ─── Export as PNG ─────────────────────────────────────────────────── */
  const handleExportPNG = useCallback(() => {
    if (elementsRef.current.length === 0) return;

    // Compute bounding box of all elements
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of elementsRef.current) {
      if (el.type === 'free_draw' || el.type === 'arrow') {
        if (el.points) {
          for (const p of el.points) {
            if (p[0] < minX) minX = p[0];
            if (p[0] > maxX) maxX = p[0];
            if (p[1] < minY) minY = p[1];
            if (p[1] > maxY) maxY = p[1];
          }
        }
      } else {
        const x1 = Math.min(el.x, el.x + el.width);
        const x2 = Math.max(el.x, el.x + el.width);
        const y1 = Math.min(el.y, el.y + el.height);
        const y2 = Math.max(el.y, el.y + el.height);
        if (x1 < minX) minX = x1;
        if (x2 > maxX) maxX = x2;
        if (y1 < minY) minY = y1;
        if (y2 > maxY) maxY = y2;
      }
    }
    const pad = 20;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = w * 2;
    offCanvas.height = h * 2;
    const ctx = offCanvas.getContext('2d')!;
    ctx.scale(2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(-minX + pad, -minY + pad);
    for (const el of elementsRef.current) {
      ctx.save();
      drawElement(ctx, el);
      ctx.restore();
    }

    const link = document.createElement('a');
    link.download = `${docName || 'whiteboard'}.png`;
    link.href = offCanvas.toDataURL('image/png');
    link.click();
  }, [docName]);

  /* ─── Back to list ─────────────────────────────────────────────────── */
  const handleBackToList = useCallback(async () => {
    if (dirtyRef.current) await saveToServer();
    setView('list');
    fetchDocuments();
  }, [saveToServer, fetchDocuments]);

  /* ═════════════════════════════════════════════════════════════════════
     Render
     ═════════════════════════════════════════════════════════════════════ */

  if (view === 'list') {
    return (
      <div className="wb-list-page">
        <div className="wb-list-header">
          <button className="wb-back-btn" onClick={() => navigate('/')}>← 返回</button>
          <h1>我的白板</h1>
          <button className="wb-create-btn" onClick={handleCreateDoc}>＋ 新建白板</button>
        </div>

        {loadingList ? (
          <div className="wb-loading">加载中...</div>
        ) : documents.length === 0 ? (
          <div className="wb-empty">
            <p>还没有白板，点击「新建白板」开始绘制</p>
          </div>
        ) : (
          <div className="wb-doc-grid">
            {documents.map(doc => (
              <div key={doc.docId} className="wb-doc-card" onClick={() => openDocument(doc.docId)}>
                <div className="wb-doc-card-name">{doc.name}</div>
                <div className="wb-doc-card-time">{new Date(doc.updatedAt).toLocaleString()}</div>
                <button
                  className="wb-doc-card-delete"
                  onClick={(e) => { e.stopPropagation(); handleDeleteDoc(doc.docId); }}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ─── Editor view ──────────────────────────────────────────────────── */
  const toolButtons: { key: typeof activeTool; label: string; shortcut: string }[] = [
    { key: 'select', label: '选择', shortcut: 'V' },
    { key: 'pan', label: '平移', shortcut: 'H' },
    { key: 'rectangle', label: '矩形', shortcut: 'R' },
    { key: 'ellipse', label: '椭圆', shortcut: 'O' },
    { key: 'arrow', label: '箭头', shortcut: 'A' },
    { key: 'free_draw', label: '画笔', shortcut: 'P' },
    { key: 'text', label: '文字', shortcut: 'T' },
  ];

  return (
    <div className="wb-editor-page">
      {/* Top bar */}
      <div className="wb-topbar">
        <button className="wb-back-btn" onClick={handleBackToList}>← 返回列表</button>
        <input
          className="wb-doc-name-input"
          value={docName}
          onChange={(e) => {
            setDocName(e.target.value);
            scheduleSave();
          }}
          onBlur={() => {
            if (docId) {
              whiteboardAPI.updateDocument(docId, { name: docName, version }).then(res => {
                setVersion(res.document.version);
              }).catch(() => {});
            }
          }}
        />
        <div className="wb-topbar-actions">
          <button onClick={undo} title="撤销 (Ctrl+Z)">↩</button>
          <button onClick={redo} title="重做 (Ctrl+Y)">↪</button>
          <button onClick={handleExportPNG} title="导出PNG">📥</button>
          <span className="wb-zoom-label">{Math.round(appState.zoom * 100)}%</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="wb-toolbar">
        {toolButtons.map(tb => (
          <button
            key={tb.key}
            className={`wb-tool-btn ${activeTool === tb.key ? 'active' : ''}`}
            onClick={() => { setActiveTool(tb.key as typeof activeTool); finishTextEditing(); }}
            title={`${tb.label} (${tb.shortcut})`}
          >
            {tb.label}
          </button>
        ))}
        <div className="wb-tool-sep" />
        <label className="wb-color-label">
          线色
          <input type="color" value={strokeColor} onChange={e => setStrokeColor(e.target.value)} />
        </label>
        <label className="wb-color-label">
          填充
          <input
            type="color"
            value={bgColor === 'transparent' ? '#ffffff' : bgColor}
            onChange={e => setBgColor(e.target.value)}
          />
          {bgColor !== 'transparent' && (
            <button className="wb-clear-bg" onClick={() => setBgColor('transparent')} title="清除填充">✕</button>
          )}
        </label>
        <label className="wb-stroke-label">
          粗细
          <input
            type="range" min="1" max="20" value={strokeWidth}
            onChange={e => setStrokeWidth(Number(e.target.value))}
          />
          <span>{strokeWidth}px</span>
        </label>
      </div>

      {/* Canvas */}
      <div className="wb-canvas-container" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="wb-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
          style={{ cursor: activeTool === 'pan' ? 'grab' : activeTool === 'select' ? 'default' : 'crosshair' }}
        />

        {/* Inline text editor */}
        {editingText && (() => {
          const el = elements.find(e => e.id === editingText);
          if (!el) return null;
          const [sx, sy] = worldToScreen(el.x, el.y, appState.zoom, appState.offsetX, appState.offsetY);
          return (
            <input
              className="wb-text-input"
              style={{
                left: sx,
                top: sy,
                width: el.width * appState.zoom,
                height: el.height * appState.zoom,
                fontSize: Math.max(14, (el.height - 8) * appState.zoom),
                color: el.strokeColor,
              }}
              autoFocus
              value={el.text || ''}
              onChange={e => handleTextChange(el.id, e.target.value)}
              onBlur={finishTextEditing}
              onKeyDown={e => { if (e.key === 'Enter') finishTextEditing(); }}
            />
          );
        })()}
      </div>
    </div>
  );
};

export default Whiteboard;
