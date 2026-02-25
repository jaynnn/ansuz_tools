import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/GuitarPractice.css';

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
  F:    { name: 'F',    positions: [1, 1, 2, 3, 3, 1], fingers: [1, 1, 2, 4, 3, 1] },
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

const SAMPLE_SONGS: Song[] = [
  {
    id: 'chengdu',
    title: '成都',
    artist: '赵雷',
    difficulty: 'beginner',
    chords: ['C', 'G', 'Am', 'F'],
    annotations: [
      { time: 0, chord: 'C', lyrics: '让我掉下眼泪的' },
      { time: 4, chord: 'G', lyrics: '不止昨夜的酒' },
      { time: 8, chord: 'Am', lyrics: '让我依依不舍的' },
      { time: 12, chord: 'F', lyrics: '不止你的温柔' },
      { time: 16, chord: 'C', lyrics: '余路还要走多久' },
      { time: 20, chord: 'G', lyrics: '你攥着我的手' },
      { time: 24, chord: 'Am', lyrics: '不置可否' },
      { time: 28, chord: 'F', lyrics: '' },
    ],
    lyricsWithChords: `[verse]
    C             G
让我掉下眼泪的  不止昨夜的酒
    Am            F
让我依依不舍的  不止你的温柔
    C             G
余路还要走多久  你攥着我的手
    Am            F
不置可否

[chorus]
    C             G
在成都的街头走一走  哦哦哦哦
    Am            F
直到所有的灯都熄灭了  也不停留
    C             G
你会挽着我的衣袖
    Am            F
我会把手揣进裤兜
    C             G             Am          F
走到玉林路的尽头  坐在小酒馆的门口`,
    createdAt: '2024-01-01',
    uploadedBy: '系统',
  },
  {
    id: 'nanshannan',
    title: '南山南',
    artist: '马頔',
    difficulty: 'beginner',
    chords: ['G', 'D', 'Am', 'C'],
    annotations: [
      { time: 0, chord: 'G', lyrics: '你在南山南' },
      { time: 4, chord: 'D', lyrics: '我在北海北' },
      { time: 8, chord: 'Am', lyrics: '南山南北海北' },
      { time: 12, chord: 'C', lyrics: '隔着山河千万里' },
      { time: 16, chord: 'G', lyrics: '我在北海北' },
      { time: 20, chord: 'D', lyrics: '你在南山南' },
    ],
    lyricsWithChords: `[verse]
    G               D
你在南山南  我在北海北
    Am              C
南山南北海北  隔着山河千万里
    G               D
我在北海北  你在南山南
    Am              C
天高云层云霄顶  冻住我的心

[chorus]
    G         D
南山南  南山南
    Am        C
冰天雪地我在你南方等你
    G         D
南山南  南山南
    Am        C
你在南山南  冻住我的心`,
    createdAt: '2024-01-02',
    uploadedBy: '系统',
  },
  {
    id: 'qingtian',
    title: '晴天',
    artist: '周杰伦',
    difficulty: 'intermediate',
    chords: ['C', 'G', 'Am', 'F', 'Em', 'Dm'],
    annotations: [
      { time: 0, chord: 'C', lyrics: '故事的小黄花' },
      { time: 4, chord: 'G', lyrics: '从出生那年就飘着' },
      { time: 8, chord: 'Am', lyrics: '童年的荡秋千' },
      { time: 12, chord: 'F', lyrics: '随记忆一直晃到现在' },
      { time: 16, chord: 'C', lyrics: 'ㄖㄡ' },
      { time: 20, chord: 'G', lyrics: '就惘然' },
      { time: 24, chord: 'Am', lyrics: '又感叹' },
      { time: 28, chord: 'Em', lyrics: '' },
    ],
    lyricsWithChords: `[verse]
    C              G
故事的小黄花  从出生那年就飘着
    Am             F
童年的荡秋千  随记忆一直晃到现在
    C              G
ㄖㄡ就惘然  又感叹
    Am      Em      Dm      G
不知不觉  我的手已  碰到你

[pre-chorus]
    C              G
刮风这天  我试过握着你手
    Am             F
但偏偏雨渐渐  大到我看你不见
    C              G
还要多久  我才能  在你身边
    Am      Dm      G       C
等到放晴的那天  也许我会比较好一点

[chorus]
    F              G              Em             Am
从前从前有个人  爱你很久  但偏偏风渐渐  把距离吹得好远
    F              G              C       Em      Am
好不容易又能再多爱一天  但故事的最后  你好像还是  离开了`,
    createdAt: '2024-01-03',
    uploadedBy: '系统',
  },
];

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
    audioRef.current.play();
    setIsPlaying(true);
    drawWaveform();
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
        <button className="upload-audio-btn" onClick={() => fileInputRef.current?.click()}>
          📁 上传音频
        </button>
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

  const currentAnnotationIdx = song.annotations.reduce((acc, ann, i) => {
    if (ann.time <= currentTime) return i;
    return acc;
  }, -1);

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
}

const SongEditor: React.FC<SongEditorProps> = ({ initial, onSave, onCancel }) => {
  const [title, setTitle] = useState(initial?.title || '');
  const [artist, setArtist] = useState(initial?.artist || '');
  const [difficulty, setDifficulty] = useState<Song['difficulty']>(initial?.difficulty || 'beginner');
  const [chordsInput, setChordsInput] = useState((initial?.chords || []).join(', '));
  const [lyricsWithChords, setLyricsWithChords] = useState(initial?.lyricsWithChords || '');
  const [error, setError] = useState('');

  const parseChords = (input: string) =>
    input.split(/[,\s]+/).map(c => c.trim()).filter(Boolean);

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
      annotations: initial?.annotations || [],
      lyricsWithChords,
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
        setError('');
      } catch {
        setError('JSON 格式错误');
      }
    };
    reader.readAsText(file);
  };

  const knownChords = parseChords(chordsInput).filter(c => !CHORD_LIBRARY[c]);

  return (
    <div className="song-editor">
      <h3>编辑歌曲</h3>
      {error && <div className="editor-error">{error}</div>}

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
          <div className="lyrics-hint">
            格式示例：在歌词行上方写和弦名（以空格分隔）
          </div>
          <textarea
            value={lyricsWithChords}
            onChange={e => setLyricsWithChords(e.target.value)}
            placeholder={`    C           G           Am          F\n天空好想下雨  我好想住你隔壁`}
            className="editor-textarea"
            rows={12}
          />
        </div>
      </div>

      <div className="editor-actions">
        <button className="btn-save" onClick={handleSave}>保存</button>
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

const GuitarPractice: React.FC = () => {
  const navigate = useNavigate();

  const [songs, setSongs] = useState<Song[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const userSongs: Song[] = saved ? JSON.parse(saved) : [];
      const sampleIds = new Set(SAMPLE_SONGS.map(s => s.id));
      const filtered = userSongs.filter((s: Song) => !sampleIds.has(s.id));
      return [...SAMPLE_SONGS, ...filtered];
    } catch {
      return SAMPLE_SONGS;
    }
  });

  const [view, setView] = useState<'library' | 'player' | 'editor'>('library');
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [editingSong, setEditingSong] = useState<Partial<Song> | undefined>(undefined);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const saveUserSongs = (all: Song[]) => {
    const sampleIds = new Set(SAMPLE_SONGS.map(s => s.id));
    const userSongs = all.filter(s => !sampleIds.has(s.id));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userSongs));
  };

  const handleSelectSong = (song: Song) => {
    setSelectedSong(song);
    setCurrentTime(0);
    setIsPlaying(false);
    setView('player');
  };

  const handleAddSong = () => {
    setEditingSong(undefined);
    setView('editor');
  };

  const handleEditSong = (song: Song) => {
    setEditingSong(song);
    setView('editor');
  };

  const handleDeleteSong = (id: string) => {
    if (!window.confirm('确定要删除这首歌吗？')) return;
    const updated = songs.filter(s => s.id !== id);
    setSongs(updated);
    saveUserSongs(updated);
  };

  const handleSaveSong = (song: Song) => {
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

  const songChords = selectedSong
    ? selectedSong.chords.map(name => CHORD_LIBRARY[name]).filter(Boolean)
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
            <button className="view-tab active">编辑</button>
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

        {view === 'player' && selectedSong && (
          <div className="player-view">
            <div className="player-top">
              <div className="song-info-header">
                <h2>{selectedSong.title}</h2>
                <span className="song-artist-name">{selectedSong.artist}</span>
                <span className={`difficulty-badge diff-${selectedSong.difficulty}`}>
                  {DIFFICULTY_LABELS[selectedSong.difficulty]}
                </span>
                <button className="export-btn" onClick={() => handleExportSong(selectedSong)}>↓ 导出</button>
              </div>
              <AudioPlayer
                audioUrl={selectedSong.audioUrl}
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
              song={selectedSong}
              currentTime={currentTime}
              isPlaying={isPlaying}
            />
          </div>
        )}

        {view === 'editor' && (
          <SongEditor
            initial={editingSong}
            onSave={handleSaveSong}
            onCancel={() => setView('library')}
          />
        )}
      </div>
    </div>
  );
};

export default GuitarPractice;
