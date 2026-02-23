import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Sudoku.css';

type Difficulty = 'easy' | 'medium' | 'hard';
type Grid = (number | null)[][];

// ============ Sudoku Generator ============
function generateSolvedGrid(): Grid {
  const grid: Grid = Array.from({ length: 9 }, () => Array(9).fill(null));

  function isValid(g: Grid, row: number, col: number, num: number): boolean {
    for (let i = 0; i < 9; i++) {
      if (g[row][i] === num || g[i][col] === num) return false;
    }
    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    for (let r = startRow; r < startRow + 3; r++) {
      for (let c = startCol; c < startCol + 3; c++) {
        if (g[r][c] === num) return false;
      }
    }
    return true;
  }

  function shuffle(arr: number[]): number[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function solve(g: Grid): boolean {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (g[row][col] === null) {
          const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
          for (const num of nums) {
            if (isValid(g, row, col, num)) {
              g[row][col] = num;
              if (solve(g)) return true;
              g[row][col] = null;
            }
          }
          return false;
        }
      }
    }
    return true;
  }

  solve(grid);
  return grid;
}

function generatePuzzle(difficulty: Difficulty): { puzzle: Grid; solution: Grid } {
  const solution = generateSolvedGrid();
  const puzzle: Grid = solution.map((row) => [...row]);

  const removals: Record<Difficulty, number> = { easy: 36, medium: 46, hard: 54 };
  const toRemove = removals[difficulty];

  const cells: [number, number][] = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      cells.push([r, c]);
    }
  }
  // Shuffle cells
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  for (let i = 0; i < toRemove; i++) {
    const [r, c] = cells[i];
    puzzle[r][c] = null;
  }

  return { puzzle, solution };
}

// ============ Component ============
const Sudoku: React.FC = () => {
  const navigate = useNavigate();
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [gameData, setGameData] = useState<{ puzzle: Grid; solution: Grid }>(() => generatePuzzle('easy'));
  const [userGrid, setUserGrid] = useState<Grid>(() => gameData.puzzle.map((row) => [...row]));
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [errors, setErrors] = useState<boolean[][]>(Array.from({ length: 9 }, () => Array(9).fill(false)));
  const [isComplete, setIsComplete] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [timerActive, setTimerActive] = useState(true);
  const [gameStarted, setGameStarted] = useState(true);
  const [notes, setNotes] = useState<Set<number>[][]>(
    Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set<number>()))
  );
  const [noteMode, setNoteMode] = useState(false);

  const puzzle = gameData.puzzle;
  const solution = gameData.solution;

  useEffect(() => {
    document.title = '数独游戏';
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (timerActive && !isComplete) {
      interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive, isComplete]);

  const startGame = useCallback((diff: Difficulty) => {
    const { puzzle: p, solution: s } = generatePuzzle(diff);
    setGameData({ puzzle: p, solution: s });
    setUserGrid(p.map((row) => [...row]));
    setSelected(null);
    setErrors(Array.from({ length: 9 }, () => Array(9).fill(false)));
    setIsComplete(false);
    setSeconds(0);
    setTimerActive(true);
    setGameStarted(true);
    setNotes(Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set<number>())));
    setNoteMode(false);
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const handleCellClick = (row: number, col: number) => {
    setSelected([row, col]);
  };

  const computeErrors = useCallback((grid: Grid): boolean[][] => {
    const errs = Array.from({ length: 9 }, () => Array(9).fill(false));
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const val = grid[r][c];
        if (val === null) continue;
        // Check row
        for (let k = 0; k < 9; k++) {
          if (k !== c && grid[r][k] === val) {
            errs[r][c] = true;
            break;
          }
        }
        // Check column
        if (!errs[r][c]) {
          for (let k = 0; k < 9; k++) {
            if (k !== r && grid[k][c] === val) {
              errs[r][c] = true;
              break;
            }
          }
        }
        // Check 3x3 box
        if (!errs[r][c]) {
          const sr = Math.floor(r / 3) * 3;
          const sc = Math.floor(c / 3) * 3;
          outer: for (let br = sr; br < sr + 3; br++) {
            for (let bc = sc; bc < sc + 3; bc++) {
              if ((br !== r || bc !== c) && grid[br][bc] === val) {
                errs[r][c] = true;
                break outer;
              }
            }
          }
        }
      }
    }
    return errs;
  }, []);

  const handleNumberInput = useCallback(
    (num: number) => {
      if (!selected || isComplete) return;
      const [row, col] = selected;
      if (puzzle[row][col] !== null) return; // original cell

      if (noteMode) {
        const newNotes = notes.map((r) => r.map((cell) => new Set(cell)));
        const cellNotes = newNotes[row][col];
        if (cellNotes.has(num)) {
          cellNotes.delete(num);
        } else {
          cellNotes.add(num);
        }
        setNotes(newNotes);
        return;
      }

      const newGrid = userGrid.map((r) => [...r]);
      newGrid[row][col] = num;
      setUserGrid(newGrid);

      // Clear notes for this cell
      const newNotes = notes.map((r) => r.map((cell) => new Set(cell)));
      newNotes[row][col] = new Set<number>();
      setNotes(newNotes);

      // Validate: mark conflicts (same number in same row/col/box), not wrong answers
      setErrors(computeErrors(newGrid));

      // Check completion
      const complete = newGrid.every((row, r) =>
        row.every((cell, c) => cell !== null && cell === solution[r][c])
      );
      if (complete) {
        setIsComplete(true);
        setTimerActive(false);
      }
    },
    [selected, puzzle, userGrid, solution, isComplete, noteMode, notes, computeErrors]
  );

  const handleErase = useCallback(() => {
    if (!selected || isComplete) return;
    const [row, col] = selected;
    if (puzzle[row][col] !== null) return;
    const newGrid = userGrid.map((r) => [...r]);
    newGrid[row][col] = null;
    setUserGrid(newGrid);

    // Re-validate all cells after erasing
    setErrors(computeErrors(newGrid));

    const newNotes = notes.map((r) => r.map((cell) => new Set(cell)));
    newNotes[row][col] = new Set<number>();
    setNotes(newNotes);
  }, [selected, puzzle, userGrid, isComplete, notes, computeErrors]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!gameStarted) return;
      if (e.key >= '1' && e.key <= '9') {
        handleNumberInput(parseInt(e.key));
      } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        handleErase();
      } else if (e.key === 'ArrowUp' && selected) {
        setSelected([(selected[0] + 8) % 9, selected[1]]);
      } else if (e.key === 'ArrowDown' && selected) {
        setSelected([(selected[0] + 1) % 9, selected[1]]);
      } else if (e.key === 'ArrowLeft' && selected) {
        setSelected([selected[0], (selected[1] + 8) % 9]);
      } else if (e.key === 'ArrowRight' && selected) {
        setSelected([selected[0], (selected[1] + 1) % 9]);
      } else if (e.key === 'n' || e.key === 'N') {
        setNoteMode((m) => !m);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [gameStarted, selected, handleNumberInput, handleErase]);

  const isRelated = (row: number, col: number): boolean => {
    if (!selected) return false;
    const [sr, sc] = selected;
    return (
      row === sr ||
      col === sc ||
      (Math.floor(row / 3) === Math.floor(sr / 3) && Math.floor(col / 3) === Math.floor(sc / 3))
    );
  };

  const isSameNumber = (row: number, col: number): boolean => {
    if (!selected) return false;
    const [sr, sc] = selected;
    const selVal = userGrid[sr]?.[sc];
    const cellVal = userGrid[row]?.[col];
    return selVal !== null && cellVal !== null && selVal === cellVal;
  };

  const difficultyLabels: Record<Difficulty, string> = {
    easy: '简单',
    medium: '中等',
    hard: '困难',
  };

  return (
    <div className="sudoku-page">
      <div className="sudoku-header">
        <button className="btn-back" onClick={() => navigate('/')}>← 返回</button>
        <h1>数独</h1>
        <div className="sudoku-timer">{formatTime(seconds)}</div>
      </div>

      <div className="sudoku-controls">
        <div className="difficulty-btns">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
            <button
              key={d}
              className={`diff-btn ${difficulty === d ? 'active' : ''}`}
              onClick={() => {
                setDifficulty(d);
                startGame(d);
              }}
            >
              {difficultyLabels[d]}
            </button>
          ))}
        </div>
        <button className="new-game-btn" onClick={() => startGame(difficulty)}>
          新游戏
        </button>
      </div>

      {isComplete && (
        <div className="sudoku-complete">
          🎉 恭喜完成！用时 {formatTime(seconds)}
        </div>
      )}

      <div className="sudoku-board">
        {userGrid.map((row, r) =>
          row.map((cell, c) => {
            const isSelected = selected?.[0] === r && selected?.[1] === c;
            const isOrig = puzzle[r]?.[c] !== null;
            const isErr = errors[r]?.[c];
            const isHighlighted = isRelated(r, c);
            const isSame = isSameNumber(r, c);
            const cellNotes = notes[r]?.[c];

            return (
              <div
                key={`${r}-${c}`}
                className={[
                  'sudoku-cell',
                  isSelected ? 'selected' : '',
                  isOrig ? 'original' : '',
                  isErr ? 'error' : '',
                  isHighlighted && !isSelected ? 'highlighted' : '',
                  isSame && !isSelected ? 'same-number' : '',
                  c % 3 === 2 && c !== 8 ? 'border-right' : '',
                  r % 3 === 2 && r !== 8 ? 'border-bottom' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => handleCellClick(r, c)}
              >
                {cell !== null ? (
                  <span className="cell-value">{cell}</span>
                ) : cellNotes && cellNotes.size > 0 ? (
                  <div className="cell-notes">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                      <span key={n} className={`note-num ${cellNotes.has(n) ? 'visible' : ''}`}>
                        {cellNotes.has(n) ? n : ''}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="sudoku-numpad">
        <div className="numpad-row">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} className="numpad-btn" onClick={() => handleNumberInput(n)}>
              {n}
            </button>
          ))}
        </div>
        <div className="numpad-actions">
          <button className="numpad-btn erase-btn" onClick={handleErase} title="删除 (Backspace)">
            ✕
          </button>
          <button
            className={`numpad-btn note-btn ${noteMode ? 'active' : ''}`}
            onClick={() => setNoteMode((m) => !m)}
            title="笔记模式 (N)"
          >
            ✏️ {noteMode ? '笔记 ON' : '笔记 OFF'}
          </button>
        </div>
      </div>

      <div className="sudoku-tips">
        <p>提示：点击格子后按键盘数字键输入，方向键移动，N键切换笔记模式</p>
      </div>
    </div>
  );
};

export default Sudoku;
