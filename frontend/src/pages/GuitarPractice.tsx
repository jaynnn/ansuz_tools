import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/GuitarPractice.css';
import { guitarPracticeAPI } from '../api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GuitarChord {
  name: string;
  positions: number[]; // 6 numbers, each string's fret (-1=muted, 0=open)
  fingers: number[];   // finger numbers (0=none, 1-4)
  baseFret?: number;
}

interface ChordAnnotation {
  time: number;
  chord: string;
  lyrics: string;
  duration?: number;
}

interface Song {
  id: string;
  title: string;
  artist: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  chords: string[];
  annotations: ChordAnnotation[];
  audioUrl?: string;
  coverUrl?: string;
  lyricsWithChords: string;
  preludeTime?: number;
  uploadedBy?: string;
  createdAt?: string;
}

// ─── Chord Library ────────────────────────────────────────────────────────────

const CHORD_LIBRARY: Record<string, GuitarChord> = {
  C:    { name: 'C',    positions: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  Cm:   { name: 'Cm',   positions: [-1, 3, 5, 5, 4, 3], fingers: [0, 1, 3, 4, 2, 1], baseFret: 3 },
  D:    { name: 'D',    positions: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  Dm:   { name: 'Dm',   positions: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  D7:   { name: 'D7',   positions: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
  E:    { name: 'E',    positions: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  Em:   { name: 'Em',   positions: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  E7:   { name: 'E7',   positions: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
  F:    { name: 'F',    positions: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1] },
  Fm:   { name: 'Fm',   positions: [1, 1, 3, 3, 2, 1], fingers: [1, 1, 3, 4, 2, 1] },
  G:    { name: 'G',    positions: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  Gm:   { name: 'Gm',   positions: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1], baseFret: 3 },
  G7:   { name: 'G7',   positions: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  A:    { name: 'A',    positions: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
  Am:   { name: 'Am',   positions: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  A7:   { name: 'A7',   positions: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] },
  Amaj7:{ name: 'Amaj7',positions: [-1, 0, 2, 1, 2, 0], fingers: [0, 0, 2, 1, 3, 0] },
  B:    { name: 'B',    positions: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1] },
  Bm:   { name: 'Bm',   positions: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1] },
  B7:   { name: 'B7',   positions: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] },
  Fmaj7:{ name: 'Fmaj7',positions: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0] },
  Cmaj7:{ name: 'Cmaj7',positions: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] },
  Gmaj7:{ name: 'Gmaj7',positions: [3, 2, 0, 0, 0, 2], fingers: [2, 1, 0, 0, 0, 3] },
};

// ─── Sample Data ──────────────────────────────────────────────────────────────

const SAMPLE_SONGS: Song[] = [];

// ─── Chord Diagram Component ──────────────────────────────────────────────────

interface ChordDiagramProps {
  chord: GuitarChord;
  size?: 'small' | 'medium' | 'large';
}

const ChordDiagram: React.FC<ChordDiagramProps> = ({ chord, size = 'medium' }) => {
  const sizes = { small: 80, medium: 120, large: 160 };
  const width = sizes[size];
  const height = width * 1.3;
  const padding = width * 0.18;
  const stringSpacing = (width - padding * 2) / 5;
  const fretSpacing = (height - padding * 2 - 20) / 4;
  const numFrets = 4;
  const dotRadius = stringSpacing * 0.32;
  const fontSize = width * 0.1;
  const nutY = padding + 20;

  const baseFret = chord.baseFret || 1;
  const showNut = baseFret === 1;

  return (
    <div className="chord-diagram">
      <div className="chord-name">{chord.name}</div>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Nut or position indicator */}
        {showNut ? (
          <rect x={padding} y={nutY - 4} width={stringSpacing * 5} height={4} fill="var(--guitar-text)" />
        ) : (
          <text x={padding - 4} y={nutY + fretSpacing * 0.5} textAnchor="end" fontSize={fontSize} fill="var(--guitar-muted)">{baseFret}</text>
        )}

        {/* Fret lines */}
        {Array.from({ length: numFrets + 1 }).map((_, i) => (
          <line
            key={i}
            x1={padding}
            y1={nutY + i * fretSpacing}
            x2={padding + stringSpacing * 5}
            y2={nutY + i * fretSpacing}
            stroke="var(--guitar-fret)"
            strokeWidth={1.5}
          />
        ))}

        {/* String lines */}
        {Array.from({ length: 6 }).map((_, i) => (
          <line
            key={i}
            x1={padding + i * stringSpacing}
            y1={nutY}
            x2={padding + i * stringSpacing}
            y2={nutY + numFrets * fretSpacing}
            stroke="var(--guitar-string)"
            strokeWidth={1.5}
          />
        ))}

        {/* Open / muted indicators */}
        {chord.positions.map((pos, i) => {
          const x = padding + i * stringSpacing;
          const y = nutY - 12;
          if (pos === -1) {
            return (
              <text key={i} x={x} y={y} textAnchor="middle" fontSize={fontSize * 1.2} fill="var(--guitar-muted)" fontWeight="bold">✕</text>
            );
          } else if (pos === 0) {
            return (
              <circle key={i} cx={x} cy={y - 2} r={dotRadius * 0.8} fill="none" stroke="var(--guitar-accent)" strokeWidth={1.5} />
            );
          }
          return null;
        })}

        {/* Finger dots */}
        {chord.positions.map((pos, i) => {
          if (pos <= 0) return null;
          const fretPos = pos - (baseFret - 1);
          if (fretPos < 1 || fretPos > numFrets) return null;
          const x = padding + i * stringSpacing;
          const y = nutY + (fretPos - 0.5) * fretSpacing;
          const finger = chord.fingers[i];
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={dotRadius} fill="var(--guitar-accent)" />
              {finger > 0 && (
                <text x={x} y={y + fontSize * 0.4} textAnchor="middle" fontSize={fontSize} fill="white" fontWeight="bold">{finger}</text>
              )}
            </g>
          );
        })}

        {/* Barre detection: if multiple strings have same fret & finger 1 */}
        {(() => {
          const barre: { fret: number; from: number; to: number } | null = (() => {
            const f1Strings = chord.positions
              .map((pos, i) => ({ pos, i, finger: chord.fingers[i] }))
              .filter(({ finger }) => finger === 1);
            if (f1Strings.length < 2) return null;
            const fret = f1Strings[0].pos;
            if (!f1Strings.every(s => s.pos === fret)) return null;
            return { fret, from: f1Strings[0].i, to: f1Strings[f1Strings.length - 1].i };
          })();
          if (!barre) return null;
          const fretPos = barre.fret - (baseFret - 1);
          if (fretPos < 1 || fretPos > numFrets) return null;
          const x1 = padding + barre.from * stringSpacing;
          const x2 = padding + barre.to * stringSpacing;
          const y = nutY + (fretPos - 0.5) * fretSpacing;
          return <line key="barre" x1={x1} y1={y} x2={x2} y2={y} stroke="var(--guitar-accent)" strokeWidth={dotRadius * 2} strokeLinecap="round" />;
        })()}
      </svg>
    </div>
  );
};

// ─── Audio Player Component ───────────────────────────────────────────────────

interface AudioPlayerProps {
  audioUrl?: string;
  onTimeUpdate?: (time: number) => void;
  onAudioLoad?: (duration: number) => void;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioUrl, onTimeUpdate, onAudioLoad }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [localAudioUrl, setLocalAudioUrl] = useState<string | undefined>(audioUrl);
  const [loopStart, setLoopStart] = useState<number | null>(null);
  const [loopEnd, setLoopEnd] = useState<number | null>(null);
  const [isLooping, setIsLooping] = useState(false);

  useEffect(() => {
    setLocalAudioUrl(audioUrl);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    cancelAnimationFrame(animFrameRef.current);
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }, [audioUrl]);

  const setupAudioContext = useCallback(() => {
    if (!audioRef.current || audioCtxRef.current) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;
    const source = ctx.createMediaElementSource(audioRef.current);
    sourceRef.current = source;
    source.connect(analyser);
    analyser.connect(ctx.destination);
  }, []);

  const drawWaveform = useCallback(() => {
    if (!canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const barWidth = canvas.width / bufferLength * 2;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * canvas.height;
      const alpha = 0.4 + (dataArray[i] / 255) * 0.6;
      ctx.fillStyle = `rgba(180, 100, 40, ${alpha})`;
      ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
    animFrameRef.current = requestAnimationFrame(drawWaveform);
  }, []);

  const handlePlay = async () => {
    if (!audioRef.current) return;
    setupAudioContext();
    if (audioCtxRef.current?.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
    try {
      await audioRef.current.play();
      setIsPlaying(true);
      drawWaveform();
    } catch (err) {
      console.error('播放失败:', err);
      setIsPlaying(false);
    }
  };

  const handlePause = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
    cancelAnimationFrame(animFrameRef.current);
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const t = audioRef.current.currentTime;
    setCurrentTime(t);
    onTimeUpdate?.(t);
    if (isLooping && loopEnd !== null && loopStart !== null && t >= loopEnd) {
      audioRef.current.currentTime = loopStart;
    }
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    const d = audioRef.current.duration;
    setDuration(d);
    onAudioLoad?.(d);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    setCurrentTime(t);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setLocalAudioUrl(url);
    setIsPlaying(false);
    setCurrentTime(0);
    // Reset audio context for new source
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  };

  const handleSetLoopPoint = (point: 'start' | 'end') => {
    if (point === 'start') setLoopStart(currentTime);
    else setLoopEnd(currentTime);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return (
    <div className="audio-player">
      {localAudioUrl && (
        <audio
          ref={audioRef}
          src={localAudioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => { setIsPlaying(false); cancelAnimationFrame(animFrameRef.current); }}
        />
      )}

      <canvas ref={canvasRef} className="waveform-canvas" width={400} height={60} />

      <div className="player-controls">
        <button className="player-btn" onClick={isPlaying ? handlePause : handlePlay} disabled={!localAudioUrl}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <div className="progress-container">
          <span className="time-display">{formatTime(currentTime)}</span>
          <input
            type="range"
            className="progress-bar"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            disabled={!localAudioUrl}
          />
          <span className="time-display">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="player-secondary-controls">
        <div className="volume-control">
          <span>🔊</span>
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={handleVolumeChange} className="volume-slider" />
        </div>

        <div className="rate-control">
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => (
            <button
              key={rate}
              className={`rate-btn${playbackRate === rate ? ' active' : ''}`}
              onClick={() => handleRateChange(rate)}
            >
              {rate}x
            </button>
          ))}
        </div>

        <div className="loop-control">
          <button
            className={`loop-btn${isLooping ? ' active' : ''}`}
            onClick={() => setIsLooping(v => !v)}
            title="AB循环"
          >
            🔁 AB
          </button>
          <button className="loop-point-btn" onClick={() => handleSetLoopPoint('start')} disabled={!localAudioUrl} title="设置A点">A</button>
          <button className="loop-point-btn" onClick={() => handleSetLoopPoint('end')} disabled={!localAudioUrl} title="设置B点">B</button>
          {loopStart !== null && loopEnd !== null && (
            <span className="loop-range">{formatTime(loopStart)}-{formatTime(loopEnd)}</span>
          )}
        </div>
      </div>

      <div className="audio-upload">
        {!localAudioUrl && (
          <button className="upload-audio-btn" onClick={() => fileInputRef.current?.click()}>
            📁 上传音频
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
        {localAudioUrl && <span className="audio-loaded">✓ 已加载</span>}
      </div>
    </div>
  );
};

// ─── Lyrics Chord Visual Editor ───────────────────────────────────────────────

interface ChordedChar {
  char: string;
  chord?: string;
}

interface VizLine {
  chars: ChordedChar[];
  isSection: boolean;
  isEmpty: boolean;
}

const CHORD_TOKEN_RE = /([A-G][#b]?(maj7|maj|m7|m|7|sus4|sus2|add9|dim|aug|2|4|9)?)/g;
const IS_CHORD_LINE_RE = /^[\s]*([A-G][#b]?(maj7|maj|m7|m|7|sus4|sus2|add9|dim|aug|2|4|9)?[\s]*)+$/;

function charDisplayWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  return (code >= 0x1100 && code <= 0x115F) ||
    (code >= 0x2E80 && code <= 0x303F) ||
    (code >= 0x3040 && code <= 0x33FF) ||
    (code >= 0x3400 && code <= 0x4DBF) ||
    (code >= 0x4E00 && code <= 0x9FFF) ||
    (code >= 0xF900 && code <= 0xFAFF) ||
    (code >= 0xFF01 && code <= 0xFF60) ||
    (code >= 0xFFE0 && code <= 0xFFE6) ? 2 : 1;
}

function parseLyricsTextToViz(text: string): VizLine[] {
  const rawLines = text.split('\n');
  const result: VizLine[] = [];
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      result.push({ chars: [{ char: trimmed }], isSection: true, isEmpty: false });
      i++;
      continue;
    }
    if (trimmed === '') {
      result.push({ chars: [], isSection: false, isEmpty: true });
      i++;
      continue;
    }
    if (IS_CHORD_LINE_RE.test(trimmed) && i + 1 < rawLines.length && rawLines[i + 1].trim() !== '') {
      const chordLineStr = line;
      const lyricLineStr = rawLines[i + 1];
      const chordMatches: { col: number; name: string }[] = [];
      CHORD_TOKEN_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = CHORD_TOKEN_RE.exec(chordLineStr)) !== null) {
        chordMatches.push({ col: m.index, name: m[0] });
      }
      const chars = Array.from(lyricLineStr.trimEnd());
      let col = 0;
      const assignedNames = new Set<string>();
      const tokens: ChordedChar[] = chars.map(ch => {
        const c = chordMatches.find(cm => cm.col >= col && cm.col < col + charDisplayWidth(ch));
        if (c) assignedNames.add(c.name + ':' + c.col);
        const token: ChordedChar = { char: ch, chord: c?.name };
        col += charDisplayWidth(ch);
        return token;
      });
      for (const cm of chordMatches) {
        if (!assignedNames.has(cm.name + ':' + cm.col)) {
          tokens.push({ char: '\u3000', chord: cm.name });
        }
      }
      result.push({ chars: tokens, isSection: false, isEmpty: false });
      i += 2;
    } else {
      const chars = Array.from(trimmed);
      result.push({ chars: chars.map(ch => ({ char: ch })), isSection: false, isEmpty: false });
      i++;
    }
  }
  return result;
}

function serializeVizToText(lines: VizLine[]): string {
  return lines.map(line => {
    if (line.isSection) return line.chars[0]?.char ?? '';
    if (line.isEmpty || line.chars.length === 0) return '';
    const hasChords = line.chars.some(c => c.chord);
    const lyricText = line.chars.map(c => c.char).join('');
    if (!hasChords) return lyricText;
    let chordRow = '';
    let col = 0;
    for (const c of line.chars) {
      if (c.chord) {
        while (chordRow.length < col) chordRow += ' ';
        chordRow += c.chord;
      }
      col += charDisplayWidth(c.char);
    }
    return chordRow + '\n' + lyricText;
  }).join('\n');
}

interface LyricsChordEditorProps {
  value: string;
  onChange: (v: string) => void;
  availableChords: string[];
}

interface LcePopup {
  lineIdx: number;
  charIdx: number;
  x: number;
  y: number;
}

const LyricsChordEditor: React.FC<LyricsChordEditorProps> = ({ value, onChange, availableChords }) => {
  const [lines, setLines] = useState<VizLine[]>(() => parseLyricsTextToViz(value));
  const [popup, setPopup] = useState<LcePopup | null>(null);
  const [dragSrc, setDragSrc] = useState<{ lineIdx: number; charIdx: number } | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastValueRef = useRef<string>(serializeVizToText(parseLyricsTextToViz(value)));

  // Lines → onChange
  useEffect(() => {
    const text = serializeVizToText(lines);
    if (text !== lastValueRef.current) {
      lastValueRef.current = text;
      onChange(text);
    }
  }, [lines]); // eslint-disable-line react-hooks/exhaustive-deps

  // External value → re-parse lines
  useEffect(() => {
    if (value !== lastValueRef.current) {
      lastValueRef.current = value;
      setLines(parseLyricsTextToViz(value));
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateChord = (li: number, ci: number, chord: string | undefined) => {
    setLines(prev => prev.map((line, i) =>
      i !== li ? line : { ...line, chars: line.chars.map((c, j) => j === ci ? { ...c, chord } : c) }
    ));
    setPopup(null);
  };

  const handleChordClick = (e: React.MouseEvent, li: number, ci: number) => {
    e.stopPropagation();
    if (popup?.lineIdx === li && popup?.charIdx === ci) {
      setPopup(null);
      return;
    }
    const containerRect = containerRef.current?.getBoundingClientRect();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!containerRect) return;
    setPopup({ lineIdx: li, charIdx: ci, x: rect.left - containerRect.left, y: rect.top - containerRect.top });
  };

  const handleDragStart = (e: React.DragEvent, li: number, ci: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${li},${ci}`);
    setDragSrc({ lineIdx: li, charIdx: ci });
  };

  const handleDrop = (e: React.DragEvent, li: number, ci: number) => {
    e.preventDefault();
    const src = dragSrc;
    setDragSrc(null);
    if (!src) return;
    const { lineIdx: fromL, charIdx: fromC } = src;
    if (fromL === li && fromC === ci) return;
    const chord = lines[fromL]?.chars[fromC]?.chord;
    if (!chord) return;
    setLines(prev => prev.map((line, i) => {
      if (i !== fromL && i !== li) return line;
      if (fromL === li) {
        return {
          ...line,
          chars: line.chars.map((c, j) => {
            if (j === fromC) return { ...c, chord: undefined };
            if (j === ci) return { ...c, chord };
            return c;
          }),
        };
      }
      if (i === fromL) return { ...line, chars: line.chars.map((c, j) => j === fromC ? { ...c, chord: undefined } : c) };
      return { ...line, chars: line.chars.map((c, j) => j === ci ? { ...c, chord } : c) };
    }));
  };

  const chordList = availableChords.length > 0 ? availableChords : Object.keys(CHORD_LIBRARY);

  return (
    <div className="lyrics-chord-editor" ref={containerRef} onClick={() => setPopup(null)}>
      <div className="lce-toolbar">
        <span className="lce-hint">点击和弦可更换；拖拽和弦可移位（下划线跟随）</span>
        <button
          type="button"
          className="lce-raw-btn"
          onClick={e => { e.stopPropagation(); setShowRaw(v => !v); }}
        >
          {showRaw ? '📊 可视模式' : '✏ 文本模式'}
        </button>
      </div>
      {showRaw ? (
        <textarea
          className="editor-textarea"
          rows={12}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={`    C           G           Am          F\n天空好想下雨  我好想住你隔壁`}
        />
      ) : (
        <div className="lce-lines">
          {lines.length === 0 && (
            <div className="lce-placeholder">暂无歌词 — 请切换到文本模式输入歌词</div>
          )}
          {lines.map((line, li) => {
            if (line.isSection) return <div key={li} className="lce-section-row">{line.chars[0]?.char}</div>;
            if (line.isEmpty) return <div key={li} className="lce-blank-row" />;
            return (
              <div key={li} className="lce-line">
                {line.chars.map((c, ci) => (
                  <div
                    key={ci}
                    className={`lce-cell${c.chord ? ' has-chord' : ''}${dragSrc?.lineIdx === li && dragSrc?.charIdx === ci ? ' dragging-src' : ''}`}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleDrop(e, li, ci)}
                  >
                    <div className="lce-chord-area">
                      {c.chord ? (
                        <span
                          className="lce-chord-label"
                          draggable
                          title="点击更换和弦；拖拽移动位置"
                          onClick={e => handleChordClick(e, li, ci)}
                          onDragStart={e => handleDragStart(e, li, ci)}
                          onDragEnd={() => setDragSrc(null)}
                        >
                          {c.chord}
                        </span>
                      ) : null}
                    </div>
                    <span className={`lce-char${c.chord ? ' underlined' : ''}`}>
                      {c.char === '\u3000' ? '\u00A0' : c.char}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {popup && (
        <div
          className="lce-popup"
          style={{ left: popup.x, top: popup.y, transform: 'translateY(-100%) translateY(-6px)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="lce-popup-header">
            <span>选择和弦</span>
            <button
              className="lce-popup-clear"
              onClick={() => updateChord(popup.lineIdx, popup.charIdx, undefined)}
            >✕ 清除</button>
          </div>
          <div className="lce-popup-grid">
            {chordList.map(name => (
              <button
                key={name}
                className={`lce-popup-btn${lines[popup.lineIdx]?.chars[popup.charIdx]?.chord === name ? ' active' : ''}`}
                onClick={() => updateChord(popup.lineIdx, popup.charIdx, name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Lyrics Viewer Component ──────────────────────────────────────────────────

interface LyricsViewerProps {
  song: Song;
  currentTime: number;
  isPlaying: boolean;
}

const LyricsViewer: React.FC<LyricsViewerProps> = ({ song, currentTime, isPlaying }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [fontSize, setFontSize] = useState(16);

  const preludeTime = song.preludeTime ?? 0;
  const adjustedTime = Math.max(0, currentTime - preludeTime);
  const isInPrelude = preludeTime > 0 && currentTime < preludeTime;

  const currentAnnotationIdx = song.annotations.reduce((acc, ann, i) => {
    if (ann.time <= adjustedTime) return i;
    return acc;
  }, -1);

  const activeAnn = !isInPrelude && currentAnnotationIdx >= 0 ? song.annotations[currentAnnotationIdx] : null;
  const nextAnn = currentAnnotationIdx + 1 < song.annotations.length
    ? song.annotations[currentAnnotationIdx + 1]
    : null;
  const annDuration = activeAnn
    ? (activeAnn.duration ?? (nextAnn ? nextAnn.time - activeAnn.time : 4))
    : 4;
  const fillPercent = activeAnn
    ? Math.min(100, Math.max(0, ((adjustedTime - activeAnn.time) / annDuration) * 100))
    : 0;

  useEffect(() => {
    if (!autoScroll || !isPlaying || !containerRef.current) return;
    const active = containerRef.current.querySelector('.lyrics-line.active');
    active?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentAnnotationIdx, autoScroll, isPlaying]);

  const handleScroll = () => {
    if (isPlaying) setAutoScroll(false);
  };

  // Parse lyricsWithChords into displayable blocks
  const parseLines = (text: string) => {
    return text.split('\n').map((line, i) => {
      const isSection = line.trim().startsWith('[');
      const isChordLine = /^\s*([A-G][#b]?(m|maj7|m7|7|sus2|sus4|add9|dim|aug)?(\s+[A-G][#b]?(m|maj7|m7|7|sus2|sus4|add9|dim|aug)?)*\s*)$/.test(line) && line.trim().length > 0;
      return { text: line, isSection, isChordLine, index: i };
    });
  };

  const lines = parseLines(song.lyricsWithChords);

  return (
    <div className="lyrics-viewer">
      {/* Karaoke current-line display */}
      <div className="karaoke-display">
        {isInPrelude ? (
          <div className="karaoke-prelude">
            🎵 前奏中... {Math.ceil(preludeTime - currentTime)}s
          </div>
        ) : activeAnn ? (
          <>
            <div className="karaoke-chord-label">{activeAnn.chord}</div>
            <div className="karaoke-text-wrapper">
              <span className="karaoke-base">{activeAnn.lyrics || '\u00A0'}</span>
              <span className="karaoke-fill" style={{ width: `${fillPercent}%` }}>
                {activeAnn.lyrics || '\u00A0'}
              </span>
            </div>
          </>
        ) : (
          <div className="karaoke-placeholder">♪ 等待播放...</div>
        )}
      </div>

      <div className="lyrics-toolbar">
        <div className="font-size-control">
          <button onClick={() => setFontSize(s => Math.max(12, s - 2))}>A-</button>
          <span>{fontSize}px</span>
          <button onClick={() => setFontSize(s => Math.min(28, s + 2))}>A+</button>
        </div>
        <button
          className={`auto-scroll-btn${autoScroll ? ' active' : ''}`}
          onClick={() => setAutoScroll(v => !v)}
        >
          {autoScroll ? '🔒 跟随' : '🔓 自由'}
        </button>
      </div>

      <div className="lyrics-container" ref={containerRef} onScroll={handleScroll} style={{ fontSize }}>
        {lines.map((line, i) => (
          <div
            key={i}
            className={`lyrics-line${line.isSection ? ' section-marker' : ''}${line.isChordLine ? ' chord-annotation-line' : ''}`}
          >
            {line.text || '\u00A0'}
          </div>
        ))}
      </div>

      {song.annotations.length > 0 && (
        <div className="annotation-progress">
          {song.annotations.map((ann, i) => (
            <div
              key={i}
              className={`annotation-pill${i === currentAnnotationIdx ? ' active' : ''}`}
            >
              <span className="pill-chord">{ann.chord}</span>
              {ann.lyrics && <span className="pill-lyrics">{ann.lyrics.substring(0, 6)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Song Editor Component ────────────────────────────────────────────────────

interface SongEditorProps {
  initial?: Partial<Song>;
  onSave: (song: Song) => void;
  onCancel: () => void;
  isLocalEdit?: boolean;
}

const SongEditor: React.FC<SongEditorProps> = ({ initial, onSave, onCancel, isLocalEdit }) => {
  const [title, setTitle] = useState(initial?.title || '');
  const [artist, setArtist] = useState(initial?.artist || '');
  const [difficulty, setDifficulty] = useState<Song['difficulty']>(initial?.difficulty || 'beginner');
  const [chordsInput, setChordsInput] = useState((initial?.chords || []).join(', '));
  const [lyricsWithChords, setLyricsWithChords] = useState(initial?.lyricsWithChords || '');
  const [error, setError] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | undefined>(undefined);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalyzingAudio, setIsAnalyzingAudio] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');
  const [annotations, setAnnotations] = useState<Song['annotations']>(initial?.annotations || []);
  const [preludeTime, setPreludeTime] = useState<number>(initial?.preludeTime ?? 0);
  const [showTimelineEditor, setShowTimelineEditor] = useState(false);
  const audioFileRef = useRef<HTMLInputElement>(null);

  const parseChords = (input: string) =>
    input.split(/[,\s]+/).map(c => c.trim()).filter(Boolean);

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10 MB，与后端限制保持一致
    if (file.size > MAX_AUDIO_SIZE) {
      setAnalyzeError(`音频文件过大（${(file.size / 1024 / 1024).toFixed(1)} MB），请上传不超过 10 MB 的音频文件`);
      e.target.value = '';
      return;
    }
    setAnalyzeError('');
    setAudioFile(file);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    // Auto-fill title from filename if not set
    if (!title) {
      const nameParts = file.name.replace(/\.[^.]+$/, '').split(/[-_]/);
      if (nameParts.length >= 2) {
        setTitle(nameParts[0].trim());
        setArtist(nameParts.slice(1).join(' ').trim());
      } else {
        setTitle(nameParts[0].trim());
      }
    }
  };

  const handleAnalyze = async () => {
    if (!title.trim() || !artist.trim()) {
      setAnalyzeError('请先填写歌曲名称和艺术家再进行 AI 识别');
      return;
    }
    setIsAnalyzing(true);
    setAnalyzeError('');
    try {
      const result = await guitarPracticeAPI.analyze(title.trim(), artist.trim());
      setDifficulty(result.difficulty);
      setChordsInput(result.chords.join(', '));
      setLyricsWithChords(result.lyricsWithChords);
      setAnnotations(result.annotations);
      setError('');
    } catch (err: any) {
      setAnalyzeError(err?.response?.data?.error || err?.message || 'AI 分析失败，请重试');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeAudio = async () => {
    if (!audioFile) {
      setAnalyzeError('请先上传音频文件再进行智谱音频分析');
      return;
    }
    setIsAnalyzingAudio(true);
    setAnalyzeError('');
    try {
      const result = await guitarPracticeAPI.analyzeAudio(
        audioFile,
        title.trim() || undefined,
        artist.trim() || undefined
      );
      setDifficulty(result.difficulty);
      setChordsInput(result.chords.join(', '));
      setLyricsWithChords(result.lyricsWithChords);
      setAnnotations(result.annotations);
      setError('');
    } catch (err: any) {
      setAnalyzeError(err?.response?.data?.error || err?.message || '音频分析失败，请重试');
    } finally {
      setIsAnalyzingAudio(false);
    }
  };

  const handleSave = () => {
    if (!title.trim()) { setError('请输入歌曲名称'); return; }
    if (!artist.trim()) { setError('请输入艺术家'); return; }
    const chords = parseChords(chordsInput);
    const song: Song = {
      id: initial?.id || `song-${Date.now()}`,
      title: title.trim(),
      artist: artist.trim(),
      difficulty,
      chords,
      annotations,
      lyricsWithChords,
      audioUrl,
      preludeTime: preludeTime > 0 ? preludeTime : undefined,
      createdAt: initial?.createdAt || new Date().toISOString().slice(0, 10),
      uploadedBy: initial?.uploadedBy || '我',
    };
    onSave(song);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as Song;
        setTitle(data.title || '');
        setArtist(data.artist || '');
        setDifficulty(data.difficulty || 'beginner');
        setChordsInput((data.chords || []).join(', '));
        setLyricsWithChords(data.lyricsWithChords || '');
        setAnnotations(data.annotations || []);
        setPreludeTime(data.preludeTime ?? 0);
        setError('');
      } catch {
        setError('JSON 格式错误');
      }
    };
    reader.readAsText(file);
  };

  const handleAnnotationChange = (idx: number, field: keyof ChordAnnotation, value: string) => {
    setAnnotations(prev => prev.map((ann, i) => {
      if (i !== idx) return ann;
      if (field === 'time' || field === 'duration') {
        const num = parseFloat(value);
        return { ...ann, [field]: isNaN(num) ? ann[field] : num };
      }
      return { ...ann, [field]: value };
    }));
  };

  const handleAddAnnotation = () => {
    const lastTime = annotations.length > 0 ? annotations[annotations.length - 1].time + 4 : 0;
    setAnnotations(prev => [...prev, { time: lastTime, chord: 'C', lyrics: '', duration: 4 }]);
  };

  const handleRemoveAnnotation = (idx: number) => {
    setAnnotations(prev => prev.filter((_, i) => i !== idx));
  };

  const knownChords = parseChords(chordsInput).filter(c => !CHORD_LIBRARY[c]);

  return (
    <div className="song-editor">
      <h3>{isLocalEdit ? '本地编辑（仅保存在本地）' : '编辑歌曲'}</h3>
      {isLocalEdit && (
        <div className="local-edit-notice">
          📝 本地编辑仅保存在您的设备上，不会影响公共曲库。可使用「提交公共区域」按钮分享给社区。
        </div>
      )}
      {error && <div className="editor-error">{error}</div>}

      {/* AI 识别区域 */}
      <div className="ai-analyze-section">
        <div className="ai-analyze-header">
          <span className="ai-icon">🎵</span>
          <span className="ai-title">上传音频 · AI 识别和弦</span>
        </div>
        <div className="ai-analyze-body">
          <div className="audio-upload-row">
            <button
              className="btn-upload-audio"
              onClick={() => audioFileRef.current?.click()}
              type="button"
            >
              📁 {audioFile ? audioFile.name : '选择音频文件'}
            </button>
            <input
              ref={audioFileRef}
              type="file"
              accept="audio/*"
              style={{ display: 'none' }}
              onChange={handleAudioUpload}
            />
            {audioUrl && <span className="audio-ready">✓ 已加载</span>}
          </div>
          <div className="ai-analyze-hint">
            填写歌曲名称和艺术家后，点击「AI 生成」通过曲名自动生成和弦与歌词。
            <br />上传音频后，点击「智谱音频分析」可直接从音频识别歌词、时间轴和和弦走向。
          </div>
          {analyzeError && <div className="editor-error">{analyzeError}</div>}
          <div className="ai-analyze-actions">
            <button
              className="btn-ai-generate"
              onClick={handleAnalyze}
              disabled={isAnalyzing || isAnalyzingAudio}
              type="button"
            >
              {isAnalyzing ? '🔄 AI 分析中...' : '✨ AI 生成'}
            </button>
            <button
              className="btn-ai-audio"
              onClick={handleAnalyzeAudio}
              disabled={!audioFile || isAnalyzing || isAnalyzingAudio}
              type="button"
              title="使用智谱 AI 从音频中识别歌词、时间轴与和弦走向"
            >
              {isAnalyzingAudio ? '🔄 音频解析中...' : '🎵 智谱音频分析'}
            </button>
          </div>
        </div>
      </div>

      <div className="editor-form">
        <div className="form-row">
          <label>歌曲名称 *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：成都" className="editor-input" />
        </div>
        <div className="form-row">
          <label>艺术家 *</label>
          <input value={artist} onChange={e => setArtist(e.target.value)} placeholder="例如：赵雷" className="editor-input" />
        </div>
        <div className="form-row">
          <label>难度</label>
          <select value={difficulty} onChange={e => setDifficulty(e.target.value as Song['difficulty'])} className="editor-select">
            <option value="beginner">初级</option>
            <option value="intermediate">中级</option>
            <option value="advanced">高级</option>
          </select>
        </div>
        <div className="form-row">
          <label>使用和弦</label>
          <input value={chordsInput} onChange={e => setChordsInput(e.target.value)} placeholder="例如：C, G, Am, F" className="editor-input" />
          {knownChords.length > 0 && (
            <span className="chord-warning">⚠ 未知和弦: {knownChords.join(', ')}</span>
          )}
        </div>
        <div className="form-row">
          <label>歌词与和弦标注</label>
          <LyricsChordEditor
            value={lyricsWithChords}
            onChange={setLyricsWithChords}
            availableChords={parseChords(chordsInput)}
          />
        </div>

        {/* Timeline Editor */}
        <div className="form-row">
          <div className="timeline-editor-header">
            <label>滚动同步时间轴</label>
            <button
              type="button"
              className="btn-toggle-timeline"
              onClick={() => setShowTimelineEditor(v => !v)}
            >
              {showTimelineEditor ? '收起' : `编辑 (${annotations.length} 条)`}
            </button>
          </div>
          {showTimelineEditor && (
            <div className="timeline-editor">
              <div className="timeline-hint">
                调整每句歌词的开始时间（秒）和演唱时长（秒），使歌词滚动与音频同步。注意：时间轴的时间为去除前奏后的相对时间。
              </div>
              <div className="prelude-row">
                <label className="prelude-label">🎵 前奏 / 间奏时长（秒）</label>
                <input
                  type="number"
                  className="timeline-input prelude-input"
                  value={preludeTime}
                  min={0}
                  step={0.5}
                  onChange={e => setPreludeTime(Math.max(0, parseFloat(e.target.value) || 0))}
                  title="歌曲开头前奏时长，歌词将在此时间后开始滚动"
                />
                <span className="prelude-unit">秒</span>
              </div>
              <div className="timeline-table">
                <div className="timeline-row timeline-header">
                  <span>时间(s)</span>
                  <span>时长(s)</span>
                  <span>和弦</span>
                  <span>歌词</span>
                  <span></span>
                </div>
                {annotations.map((ann, i) => (
                  <div key={i} className="timeline-row">
                    <input
                      type="number"
                      className="timeline-input"
                      value={ann.time}
                      min={0}
                      step={0.5}
                      onChange={e => handleAnnotationChange(i, 'time', e.target.value)}
                    />
                    <input
                      type="number"
                      className="timeline-input"
                      value={ann.duration ?? ''}
                      min={0.5}
                      step={0.5}
                      placeholder="自动"
                      onChange={e => handleAnnotationChange(i, 'duration', e.target.value)}
                    />
                    <input
                      type="text"
                      className="timeline-input timeline-chord"
                      value={ann.chord}
                      onChange={e => handleAnnotationChange(i, 'chord', e.target.value)}
                    />
                    <input
                      type="text"
                      className="timeline-input timeline-lyrics"
                      value={ann.lyrics}
                      onChange={e => handleAnnotationChange(i, 'lyrics', e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-remove-annotation"
                      onClick={() => handleRemoveAnnotation(i)}
                    >✕</button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn-add-annotation" onClick={handleAddAnnotation}>
                + 添加行
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="editor-actions">
        <button className="btn-save" onClick={handleSave}>{isLocalEdit ? '保存到本地' : '保存'}</button>
        <button className="btn-cancel" onClick={onCancel}>取消</button>
        <label className="btn-import">
          导入 JSON
          <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
        </label>
      </div>
    </div>
  );
};

// ─── Song Library Component ───────────────────────────────────────────────────

interface SongLibraryProps {
  songs: Song[];
  onSelect: (song: Song) => void;
  onEdit: (song: Song) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

const DIFFICULTY_LABELS: Record<Song['difficulty'], string> = {
  beginner: '初级',
  intermediate: '中级',
  advanced: '高级',
};

const SongLibrary: React.FC<SongLibraryProps> = ({ songs, onSelect, onEdit, onDelete, onAdd }) => {
  const [search, setSearch] = useState('');
  const [filterDiff, setFilterDiff] = useState<string>('');
  const [filterChord, setFilterChord] = useState('');

  const filtered = songs.filter(s => {
    const matchSearch = !search || s.title.includes(search) || s.artist.includes(search);
    const matchDiff = !filterDiff || s.difficulty === filterDiff;
    const matchChord = !filterChord || s.chords.includes(filterChord.trim());
    return matchSearch && matchDiff && matchChord;
  });

  const allChords = Array.from(new Set(songs.flatMap(s => s.chords))).sort();

  return (
    <div className="song-library">
      <div className="library-header">
        <h3>曲库</h3>
        <button className="btn-add-song" onClick={onAdd}>+ 添加歌曲</button>
      </div>

      <div className="library-filters">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索歌名、艺术家..."
          className="search-input"
        />
        <select value={filterDiff} onChange={e => setFilterDiff(e.target.value)} className="filter-select">
          <option value="">所有难度</option>
          <option value="beginner">初级</option>
          <option value="intermediate">中级</option>
          <option value="advanced">高级</option>
        </select>
        <select value={filterChord} onChange={e => setFilterChord(e.target.value)} className="filter-select">
          <option value="">所有和弦</option>
          {allChords.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="song-list">
        {filtered.length === 0 && <div className="no-songs">暂无歌曲</div>}
        {filtered.map(song => (
          <div key={song.id} className="song-item" onClick={() => onSelect(song)}>
            <div className="song-item-main">
              <span className="song-title">{song.title}</span>
              <span className="song-artist">{song.artist}</span>
              <span className={`difficulty-badge diff-${song.difficulty}`}>
                {DIFFICULTY_LABELS[song.difficulty]}
              </span>
            </div>
            <div className="song-item-chords">
              {song.chords.map(c => <span key={c} className="chord-tag">{c}</span>)}
            </div>
            <div className="song-item-meta">
              {song.uploadedBy && <span>{song.uploadedBy}</span>}
              {song.createdAt && <span>{song.createdAt}</span>}
            </div>
            <div className="song-item-actions" onClick={e => e.stopPropagation()}>
              <button onClick={() => onEdit(song)} className="btn-edit-song">编辑</button>
              {!SAMPLE_SONGS.some(s => s.id === song.id) && (
                <button onClick={() => onDelete(song.id)} className="btn-delete-song">删除</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Main Guitar Practice Component ──────────────────────────────────────────

const STORAGE_KEY = 'guitar_practice_songs';
const LOCAL_EDITS_KEY = 'guitar_local_edits';

const GuitarPractice: React.FC = () => {
  const navigate = useNavigate();

  const [songs, setSongs] = useState<Song[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const userSongs: Song[] = saved ? JSON.parse(saved) : [];
      const sampleIds = new Set(SAMPLE_SONGS.map(s => s.id));
      const filtered = userSongs
        .filter((s: Song) => !sampleIds.has(s.id))
        .map((s: Song) => ({
          ...s,
          // Blob URLs expire on page reload, clear them to avoid broken playback
          audioUrl: s.audioUrl?.startsWith('blob:') ? undefined : s.audioUrl,
        }));
      return [...SAMPLE_SONGS, ...filtered];
    } catch {
      return SAMPLE_SONGS;
    }
  });

  // Local edits: { [songId]: Song }
  const [localEdits, setLocalEdits] = useState<Record<string, Song>>(() => {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_EDITS_KEY) || '{}');
    } catch {
      return {};
    }
  });

  const [view, setView] = useState<'library' | 'player' | 'editor'>('library');
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [editingSong, setEditingSong] = useState<Partial<Song> | undefined>(undefined);
  const [isLocalEditMode, setIsLocalEditMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load community songs on mount
  useEffect(() => {
    guitarPracticeAPI.getCommunitySongs().then(communitySongs => {
      setSongs(prev => {
        const existingIds = new Set(prev.map(s => s.id));
        const newOnes = communitySongs.filter(s => !existingIds.has(s.id));
        return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
      });
    }).catch(() => {/* silently ignore if API unavailable */});
  }, []);

  const saveUserSongs = (all: Song[]) => {
    const sampleIds = new Set(SAMPLE_SONGS.map(s => s.id));
    const userSongs = all.filter(s => !sampleIds.has(s.id) && !s.id.startsWith('community-'));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userSongs));
  };

  const saveLocalEdits = (edits: Record<string, Song>) => {
    setLocalEdits(edits);
    localStorage.setItem(LOCAL_EDITS_KEY, JSON.stringify(edits));
  };

  // Get effective song (with local edits applied if any)
  const getEffectiveSong = (song: Song): Song => localEdits[song.id] ?? song;

  const handleSelectSong = (song: Song) => {
    setSelectedSong(song);
    setCurrentTime(0);
    setIsPlaying(false);
    setSubmitStatus('');
    setView('player');
  };

  const handleAddSong = () => {
    setEditingSong(undefined);
    setIsLocalEditMode(false);
    setView('editor');
  };

  const handleEditSong = (song: Song) => {
    setEditingSong(song);
    setIsLocalEditMode(false);
    setView('editor');
  };

  const handleLocalEditSong = (song: Song) => {
    // Open editor with effective song (local edit if exists, else original)
    setEditingSong(getEffectiveSong(song));
    setIsLocalEditMode(true);
    setView('editor');
  };

  const handleDeleteSong = (id: string) => {
    if (!window.confirm('确定要删除这首歌吗？')) return;
    const updated = songs.filter(s => s.id !== id);
    setSongs(updated);
    saveUserSongs(updated);
    // Also remove local edit
    const newEdits = { ...localEdits };
    delete newEdits[id];
    saveLocalEdits(newEdits);
  };

  const handleSaveSong = (song: Song) => {
    if (isLocalEditMode && selectedSong) {
      // Save as local edit for the original song id
      const edits = { ...localEdits, [selectedSong.id]: { ...song, id: selectedSong.id } };
      saveLocalEdits(edits);
      // Update selectedSong to reflect local edit
      setSelectedSong({ ...song, id: selectedSong.id });
      setView('player');
    } else {
      const existing = songs.findIndex(s => s.id === song.id);
      let updated: Song[];
      if (existing >= 0) {
        updated = songs.map(s => s.id === song.id ? song : s);
      } else {
        updated = [...songs, song];
      }
      setSongs(updated);
      saveUserSongs(updated);
      setView('library');
    }
  };

  const handleCancelEdit = () => {
    if (isLocalEditMode) {
      setView('player');
    } else {
      setView('library');
    }
  };

  const handleExportSong = (song: Song) => {
    const data = JSON.stringify(song, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${song.title}-${song.artist}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmitToPublic = async (song: Song) => {
    setIsSubmitting(true);
    setSubmitStatus('');
    try {
      const result = await guitarPracticeAPI.submitSong({
        title: song.title,
        artist: song.artist,
        difficulty: song.difficulty,
        chords: song.chords,
        lyricsWithChords: song.lyricsWithChords,
        annotations: song.annotations,
      });
      if (result.isPublic) {
        setSubmitStatus(`✅ 提交成功！已有 ${result.submissionCount} 人提交，歌曲已发布到公共区域。`);
      } else {
        setSubmitStatus(`✅ 提交成功！已有 ${result.submissionCount} 人提交，再有 ${2 - result.submissionCount} 人提交后将发布到公共区域。`);
      }
    } catch (err: any) {
      setSubmitStatus(`❌ 提交失败：${err?.response?.data?.error || err?.message || '请稍后重试'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const effectiveSong = selectedSong ? getEffectiveSong(selectedSong) : null;
  const hasLocalEdit = selectedSong ? !!localEdits[selectedSong.id] : false;

  const songChords = effectiveSong
    ? effectiveSong.chords.map(name => CHORD_LIBRARY[name]).filter(Boolean)
    : [];

  return (
    <div className="guitar-practice-page">
      <div className="guitar-header">
        <button className="back-btn" onClick={() => navigate('/')}>← 返回</button>
        <div className="guitar-title-area">
          <span className="guitar-icon">🎸</span>
          <h1>吉他练习助手</h1>
        </div>
        <div className="view-tabs">
          <button className={`view-tab${view === 'library' ? ' active' : ''}`} onClick={() => setView('library')}>曲库</button>
          {selectedSong && (
            <button className={`view-tab${view === 'player' ? ' active' : ''}`} onClick={() => setView('player')}>练习</button>
          )}
          {view === 'editor' && (
            <button className="view-tab active">{isLocalEditMode ? '本地编辑' : '编辑'}</button>
          )}
        </div>
      </div>

      <div className="guitar-body">
        {view === 'library' && (
          <SongLibrary
            songs={songs}
            onSelect={handleSelectSong}
            onEdit={handleEditSong}
            onDelete={handleDeleteSong}
            onAdd={handleAddSong}
          />
        )}

        {view === 'player' && selectedSong && effectiveSong && (
          <div className="player-view">
            <div className="player-top">
              <div className="song-info-header">
                <h2>{effectiveSong.title}</h2>
                <span className="song-artist-name">{effectiveSong.artist}</span>
                <span className={`difficulty-badge diff-${effectiveSong.difficulty}`}>
                  {DIFFICULTY_LABELS[effectiveSong.difficulty]}
                </span>
                {hasLocalEdit && <span className="local-edit-badge">✏ 本地已编辑</span>}
                <div className="song-header-actions">
                  <button className="btn-local-edit" onClick={() => handleLocalEditSong(selectedSong)}>
                    ✏ 本地编辑
                  </button>
                  <button
                    className="btn-submit-public"
                    onClick={() => handleSubmitToPublic(effectiveSong)}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? '提交中...' : '🌐 提交公共区域'}
                  </button>
                  <button className="export-btn" onClick={() => handleExportSong(effectiveSong)}>↓ 导出</button>
                </div>
              </div>
              {submitStatus && (
                <div className="submit-status">{submitStatus}</div>
              )}
              <AudioPlayer
                audioUrl={effectiveSong.audioUrl}
                onTimeUpdate={t => setCurrentTime(t)}
                onAudioLoad={() => {}}
              />
            </div>

            {songChords.length > 0 && (
              <div className="chord-diagrams-section">
                <h3>本曲和弦</h3>
                <div className="chord-diagrams-grid">
                  {songChords.map(chord => (
                    <ChordDiagram key={chord.name} chord={chord} size="medium" />
                  ))}
                </div>
              </div>
            )}

            <LyricsViewer
              song={effectiveSong}
              currentTime={currentTime}
              isPlaying={isPlaying}
            />
          </div>
        )}

        {view === 'editor' && (
          <SongEditor
            initial={editingSong}
            onSave={handleSaveSong}
            onCancel={handleCancelEdit}
            isLocalEdit={isLocalEditMode}
          />
        )}
      </div>
    </div>
  );
};

export default GuitarPractice;
