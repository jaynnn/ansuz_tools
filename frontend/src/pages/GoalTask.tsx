import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { goalTaskAPI } from '../api';
import '../styles/GoalTask.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Goal {
  id: number;
  user_id: number;
  target_text: string;
  current_level: string | null;
  status: 'not_started' | 'in_progress' | 'done';
  created_at: string;
}

interface Session {
  id: number;
  goal_id: number;
  available_minutes: number;
  session_target: string | null;
  is_complete: number;
  created_at: string;
  completed_at: string | null;
  trainingItems?: TrainingItem[];
}

interface TrainingItem {
  id: number;
  session_id: number;
  description: string;
  is_completed: number;
}

interface LevelOption {
  [key: string]: string;
}

type ViewMode =
  | 'main'
  | 'add-goal'
  | 'add-level'
  | 'history'
  | 'task-details'
  | 'training-chat'
  | 'practice';

// ─── Preset goal suggestions ──────────────────────────────────────────────────

const ALL_PRESET_GOALS = [
  '五年内达到钢琴十级',
  '半年内马拉松达到4小时30分',
  '三个月内学会基础吉他弹唱',
  '一年内通过英语CET-6考试',
  '六个月内完成10公里晨跑计划',
  '两年内考取驾驶证',
  '三个月内学会游泳并能游100米',
  '一年内读完50本书',
  '半年内学会Python编程基础',
  '三个月内减重10斤并保持体型',
  '一年内学会基础西班牙语日常对话',
  '半年内学会素描人物画',
  '一年内备考并通过注册会计师一门',
  '三个月内完成第一次铁人三项比赛',
];

const getRandomPresets = (count: number) => {
  const shuffled = [...ALL_PRESET_GOALS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};

// ─── Practice helpers ─────────────────────────────────────────────────────────

const PRACTICE_TYPE_MAP: Record<string, string> = {
  coding: '编程',
  sql: 'SQL',
  writing: '写作',
  math: '数学',
  translation: '翻译',
  grammar: '英语语法',
  vocabulary: '词汇',
  logic: '逻辑推理',
  reading: '阅读理解',
  speaking: '口语表达',
  music: '乐理',
  data: '数据分析',
  quiz: '知识问答',
  general: '综合练习',
};

const detectPracticeType = (description: string): string => {
  const d = description.toLowerCase();
  if (/编程|代码|python|javascript|java|html|css|算法|程序|函数|变量|接口|api/.test(d)) return 'coding';
  if (/sql|数据库|查询|database|select|insert|table/.test(d)) return 'sql';
  if (/写作|作文|文章|散文|随笔|叙事|议论文|记叙文/.test(d)) return 'writing';
  if (/数学|计算|方程|几何|代数|微积分|概率|积分|导数|二次/.test(d)) return 'math';
  if (/翻译|英译中|中译英|汉译英/.test(d)) return 'translation';
  if (/英语语法|grammar|时态|句型|从句|虚拟语气/.test(d)) return 'grammar';
  if (/单词|词汇|vocabulary|拼写|词组|词义/.test(d)) return 'vocabulary';
  if (/逻辑|推理|悖论|谜题|规律|演绎/.test(d)) return 'logic';
  if (/阅读理解|reading|文章分析|passage/.test(d)) return 'reading';
  if (/演讲|口语|朗读|表达|对话/.test(d)) return 'speaking';
  if (/音乐|乐理|节奏|和弦|音阶|五线谱|简谱/.test(d)) return 'music';
  if (/数据分析|统计|图表|excel/.test(d)) return 'data';
  if (/历史|地理|政治|生物|化学|物理|知识点|考点/.test(d)) return 'quiz';
  return 'general';
};

const buildPracticeGeneratePrompt = (type: string, description: string): string => {
  const instructions: Record<string, string> = {
    coding: `请根据训练任务「${description}」生成一道编程练习题。包含：问题描述、输入输出示例、约束条件，难度中等。`,
    sql: `请根据训练任务「${description}」生成一道SQL练习题：描述表结构（简短CREATE TABLE示例）和查询需求。`,
    writing: `请根据训练任务「${description}」给出一个写作练习：写作主题、具体要求（100~300字）及写作提示。`,
    math: `请根据训练任务「${description}」出一道数学练习题，题目完整，数据清晰，难度中等。`,
    translation: `请根据训练任务「${description}」提供3~5句待翻译文本，注明翻译方向（中译英或英译中）。`,
    grammar: `请根据训练任务「${description}」设计5道英语语法练习（填空或改错），每题标注考查点。`,
    vocabulary: `请根据训练任务「${description}」设计5道词汇题：给出释义或例句，让学习者写出对应单词。`,
    logic: `请根据训练任务「${description}」设计一道逻辑推理题，包含完整题干和必要条件，难度中等。`,
    reading: `请根据训练任务「${description}」提供一篇80~120字短文，并提出2~3道理解题。`,
    speaking: `请根据训练任务「${description}」设计一个情景写作练习：描述场景，给出对话开头，要求续写50~100字。`,
    music: `请根据训练任务「${description}」出一道乐理题（识谱、节奏、和弦或音阶），难度中等。`,
    data: `请根据训练任务「${description}」给出一个数据分析练习：描述数据场景，提出2道分析问题。`,
    quiz: `请根据训练任务「${description}」出3道单选题，每题4个选项，覆盖核心知识点。`,
    general: `请根据训练任务「${description}」设计一道综合练习题，用于检验学习成效，难度适中。`,
  };
  return instructions[type] || instructions.general;
};

const buildPracticeEvaluatePrompt = (type: string, problem: string, answer: string, language?: string): string => {
  const langNote = type === 'coding' && language ? `（编程语言：${language}）` : '';
  return `请评估以下练习的作答${langNote}：\n\n【练习题】\n${problem}\n\n【学习者的答案】\n${answer}\n\n请按以下格式回复：\n1. 综合评分（xx/100）\n2. 正确之处\n3. 需要改进的地方\n4. 具体建议`;
};

// ─── GoalItem component ───────────────────────────────────────────────────────

interface GoalItemProps {
  goal: Goal;
  onDelete: (id: number) => void;
  onHistory: (goal: Goal) => void;
  onClick: (goal: Goal) => void;
}

const GoalItem: React.FC<GoalItemProps> = ({ goal, onDelete, onHistory, onClick }) => {
  const [swiped, setSwiped] = useState(false);
  const startXRef = useRef(0);
  const itemRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - startXRef.current;
    if (dx < -50) setSwiped(true);
    else if (dx > 30) setSwiped(false);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    startXRef.current = e.clientX;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const dx = e.clientX - startXRef.current;
    if (dx < -50) setSwiped(true);
    else if (dx > 30) setSwiped(false);
    else if (Math.abs(dx) < 5) onClick(goal);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`确定要删除目标「${goal.target_text}」吗？`)) {
      onDelete(goal.id);
    }
    setSwiped(false);
  };

  const handleHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    onHistory(goal);
    setSwiped(false);
  };

  return (
    <div className={`goal-item-wrapper ${goal.status === 'in_progress' ? 'ring-active' : ''}`}>
      <div
        className={`goal-item ${swiped ? 'swiped' : ''} status-${goal.status}`}
        ref={itemRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        <div className="goal-item-content">
          <span className="goal-text">{goal.target_text}</span>
          {goal.status === 'done' && (
            <div className="done-badge">DONE</div>
          )}
        </div>
      </div>
      <div className={`goal-actions ${swiped ? 'visible' : ''}`}>
        <button className="action-btn history-btn" onClick={handleHistory}>历史</button>
        <button className="action-btn delete-btn" onClick={handleDelete}>删除</button>
      </div>
    </div>
  );
};

// ─── Main GoalTask page ───────────────────────────────────────────────────────

const GoalTask: React.FC = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  // Add goal flow
  const [goalInput, setGoalInput] = useState('');
  const [presetGoals, setPresetGoals] = useState<string[]>([]);
  const [loadingLevelOptions, setLoadingLevelOptions] = useState(false);
  const [levelOptions, setLevelOptions] = useState<LevelOption[]>([]);
  const [selectedLevel, setSelectedLevel] = useState('');
  const [levelInput, setLevelInput] = useState('');
  const [buildingText, setBuildingText] = useState('');
  const buildingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start task modal
  const [showStartModal, setShowStartModal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [taskHours, setTaskHours] = useState(1);
  const [taskMinutes, setTaskMinutes] = useState(0);
  const [creatingSession, setCreatingSession] = useState(false);

  // Printing animation
  const [showPrinting, setShowPrinting] = useState(false);
  const [printingLines, setPrintingLines] = useState<string[]>([]);
  const [paperProgress, setPaperProgress] = useState(0);
  const [sessionData, setSessionData] = useState<{ session: Session; trainingItems: TrainingItem[] } | null>(null);
  const [printDone, setPrintDone] = useState(false);
  const printIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Task details
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [trainingItems, setTrainingItems] = useState<TrainingItem[]>([]);
  const [showCongrats, setShowCongrats] = useState(false);

  // History
  const [historyGoal, setHistoryGoal] = useState<Goal | null>(null);
  const [historySessions, setHistorySessions] = useState<Session[]>([]);

  // Training chat
  const [chatTraining, setChatTraining] = useState<TrainingItem | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Practice
  const [practiceTraining, setPracticeTraining] = useState<TrainingItem | null>(null);
  const [practiceType, setPracticeType] = useState<string>('general');
  const [practicePhase, setPracticePhase] = useState<'loading' | 'problem' | 'evaluating' | 'result'>('loading');
  const [practiceProblem, setPracticeProblem] = useState<string>('');
  const [practiceAnswer, setPracticeAnswer] = useState<string>('');
  const [practiceLanguage, setPracticeLanguage] = useState<string>('python');
  const [practiceResult, setPracticeResult] = useState<string>('');

  useEffect(() => {
    document.title = '目标任务';
    fetchGoals();
    setPresetGoals(getRandomPresets(4));
  }, []);

  const fetchGoals = async () => {
    try {
      setLoading(true);
      const data = await goalTaskAPI.getGoals();
      setGoals(data.goals || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGoal = async (id: number) => {
    try {
      await goalTaskAPI.deleteGoal(id);
      await fetchGoals();
    } catch (err) {
      console.error(err);
    }
  };

  const handleGoalClick = async (goal: Goal) => {
    if (goal.status === 'in_progress') {
      // Show task details with active session
      try {
        const data = await goalTaskAPI.getActiveSession(goal.id);
        if (data.session) {
          setSelectedGoal(goal);
          setActiveSession(data.session);
          setTrainingItems(data.trainingItems || []);
          setShowCongrats(false);
          setViewMode('task-details');
        }
      } catch (err) {
        console.error(err);
      }
    } else if (goal.status === 'not_started') {
      // Check if another goal is in progress
      const inProgressGoal = goals.find(g => g.status === 'in_progress');
      if (inProgressGoal && inProgressGoal.id !== goal.id) {
        alert('请先完成当前在进行的任务');
        return;
      }
      setSelectedGoal(goal);
      setTaskHours(1);
      setTaskMinutes(0);
      setShowStartModal(true);
    }
  };

  // ── Add Goal flow ──────────────────────────────────────────────────────────

  const handleOpenAddGoal = () => {
    setGoalInput('');
    setPresetGoals(getRandomPresets(4));
    setViewMode('add-goal');
  };

  const startBuildingAnimation = () => {
    let count = 1;
    const texts = ['正在构建水平阶段', '正在分析目标', '正在生成选项'];
    let textIdx = 0;
    buildingIntervalRef.current = setInterval(() => {
      const dots = '.'.repeat(count);
      setBuildingText(texts[textIdx % texts.length] + dots);
      count = count >= 3 ? 1 : count + 1;
      if (count === 1) textIdx++;
    }, 500);
  };

  const stopBuildingAnimation = () => {
    if (buildingIntervalRef.current) {
      clearInterval(buildingIntervalRef.current);
      buildingIntervalRef.current = null;
    }
    setBuildingText('');
  };

  const handleConfirmGoal = async () => {
    if (!goalInput.trim()) return;
    setLoadingLevelOptions(true);
    startBuildingAnimation();
    try {
      const data = await goalTaskAPI.getLevelOptions(goalInput.trim());
      setLevelOptions(data.options || []);
      setSelectedLevel('');
      setLevelInput('');
      setViewMode('add-level');
    } catch (err) {
      console.error(err);
      alert('获取水平选项失败，请重试');
    } finally {
      setLoadingLevelOptions(false);
      stopBuildingAnimation();
    }
  };

  const handleConfirmLevel = async () => {
    const level = levelInput.trim() || selectedLevel;
    if (!goalInput.trim()) return;
    try {
      await goalTaskAPI.createGoal(goalInput.trim(), level);
      await fetchGoals();
      setViewMode('main');
    } catch (err) {
      console.error(err);
      alert('创建目标失败，请重试');
    }
  };

  // ── Start Task Modal ───────────────────────────────────────────────────────

  const handleConfirmStartTask = async () => {
    if (!selectedGoal) return;
    const totalMinutes = taskHours * 60 + taskMinutes;
    if (totalMinutes <= 0) {
      alert('请设置训练时长');
      return;
    }
    setCreatingSession(true);
    setShowStartModal(false);
    setShowPrinting(true);
    setPaperProgress(0);
    setPrintDone(false);

    // Start paper printing animation
    const analysisPhrases = [
      `正在分析...`,
      `${totalMinutes}分钟的练习时长...`,
      `分析当前水平：${selectedGoal.current_level || '初始阶段'}...`,
      `结合历史训练记录...`,
      `生成个性化训练方案...`,
    ];
    setPrintingLines([]);

    let phraseIdx = 0;
    printIntervalRef.current = setInterval(() => {
      if (phraseIdx < analysisPhrases.length) {
        setPrintingLines(prev => [...prev, analysisPhrases[phraseIdx]]);
        phraseIdx++;
      }
    }, 600);

    // Animate paper progress
    let progress = 0;
    const paperInterval = setInterval(() => {
      progress += 2;
      setPaperProgress(Math.min(progress, 100));
      if (progress >= 100) clearInterval(paperInterval);
    }, 80);

    try {
      const data = await goalTaskAPI.createSession(selectedGoal.id, totalMinutes);
      if (printIntervalRef.current) clearInterval(printIntervalRef.current);
      clearInterval(paperInterval);
      setPaperProgress(100);
      setPrintDone(true);
      setSessionData(data);
      setActiveSession(data.session);
      setTrainingItems(data.trainingItems || []);
      // Refresh goals
      await fetchGoals();
    } catch (err: any) {
      if (printIntervalRef.current) clearInterval(printIntervalRef.current);
      clearInterval(paperInterval);
      setShowPrinting(false);
      setCreatingSession(false);
      alert(err?.response?.data?.error || '生成训练计划失败，请重试');
    }
  };

  const handleTakeTask = () => {
    setShowPrinting(false);
    setCreatingSession(false);
    setShowCongrats(false);
    setViewMode('task-details');
  };

  // ── Training completion ────────────────────────────────────────────────────

  const handleToggleTraining = async (item: TrainingItem) => {
    try {
      const result = await goalTaskAPI.toggleTrainingComplete(item.id);
      setTrainingItems(prev =>
        prev.map(t => t.id === item.id ? { ...t, is_completed: result.is_completed } : t)
      );
      if (result.sessionCompleted) {
        setShowCongrats(true);
        await fetchGoals();
        // Update selected goal status
        if (selectedGoal) {
          setSelectedGoal(prev => prev ? { ...prev, status: 'done' } : null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ── History ────────────────────────────────────────────────────────────────

  const handleOpenHistory = async (goal: Goal) => {
    setHistoryGoal(goal);
    try {
      const data = await goalTaskAPI.getSessions(goal.id);
      setHistorySessions(data.sessions || []);
    } catch (err) {
      console.error(err);
    }
    setViewMode('history');
  };

  // ── Training chat ──────────────────────────────────────────────────────────

  const handleOpenTrainingChat = (item: TrainingItem) => {
    setChatTraining(item);
    setChatMessages([]);
    setChatInput('');
    setViewMode('training-chat');
  };

  const handleOpenPractice = async (item: TrainingItem) => {
    const type = detectPracticeType(item.description);
    setPracticeTraining(item);
    setPracticeType(type);
    setPracticePhase('loading');
    setPracticeProblem('');
    setPracticeAnswer('');
    setPracticeResult('');
    setViewMode('practice');
    try {
      const prompt = buildPracticeGeneratePrompt(type, item.description);
      const data = await goalTaskAPI.chatAboutTraining(item.id, [{ role: 'user', content: prompt }]);
      setPracticeProblem(data.content);
      setPracticePhase('problem');
    } catch (err) {
      console.error(err);
      setPracticeProblem('生成练习题失败，请返回重试。');
      setPracticePhase('problem');
    }
  };

  const handleSubmitPractice = async () => {
    if (!practiceAnswer.trim() || !practiceTraining) return;
    setPracticePhase('evaluating');
    try {
      const evalPrompt = buildPracticeEvaluatePrompt(practiceType, practiceProblem, practiceAnswer, practiceLanguage);
      const data = await goalTaskAPI.chatAboutTraining(practiceTraining.id, [{ role: 'user', content: evalPrompt }]);
      setPracticeResult(data.content);
      setPracticePhase('result');
    } catch (err) {
      console.error(err);
      setPracticeResult('评估失败，请重试。');
      setPracticePhase('result');
    }
  };

  const handlePracticeAgain = async () => {
    if (!practiceTraining) return;
    setPracticePhase('loading');
    setPracticeProblem('');
    setPracticeAnswer('');
    setPracticeResult('');
    try {
      const prompt = buildPracticeGeneratePrompt(practiceType, practiceTraining.description);
      const data = await goalTaskAPI.chatAboutTraining(practiceTraining.id, [{ role: 'user', content: prompt }]);
      setPracticeProblem(data.content);
      setPracticePhase('problem');
    } catch (err) {
      console.error(err);
      setPracticeProblem('生成练习题失败，请返回重试。');
      setPracticePhase('problem');
    }
  };

  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim() || !chatTraining) return;
    const userMsg = { role: 'user' as const, content: chatInput.trim() };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);
    try {
      const data = await goalTaskAPI.chatAboutTraining(chatTraining.id, newMessages);
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, { role: 'assistant', content: '抱歉，请求失败，请重试。' }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatMessages, chatTraining]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ─── Render ────────────────────────────────────────────────────────────────

  // History view
  if (viewMode === 'history') {
    return (
      <div className="gt-page">
        <div className="gt-nav-bar">
          <button className="gt-back-btn" onClick={() => setViewMode('main')}>‹ 返回</button>
          <h1 className="gt-nav-title">任务历史</h1>
        </div>
        <div className="gt-history-goal-title">{historyGoal?.target_text}</div>
        <div className="gt-history-list">
          {historySessions.length === 0 ? (
            <div className="gt-empty">暂无历史记录</div>
          ) : (
            historySessions.map((s: Session) => {
              const start = new Date(s.created_at);
              const durationMin = s.available_minutes;
              const items = s.trainingItems || [];
              return (
                <div key={s.id} className="gt-history-item">
                  <div className="gt-history-date">{start.toLocaleString('zh-CN')}</div>
                  <div className="gt-history-meta">
                    <span>训练时长：{durationMin} 分钟</span>
                    <span className={`gt-history-status ${s.is_complete ? 'done' : 'pending'}`}>
                      {s.is_complete ? '已完成' : '未完成'}
                    </span>
                  </div>
                  {s.session_target && <div className="gt-history-target">目标：{s.session_target}</div>}
                  <div className="gt-history-trainings">
                  {items.map((t: TrainingItem, i: number) => (
                      <div key={t.id} className={`gt-history-training ${t.is_completed ? 'done' : ''}`}>
                        {i + 1}. {t.description}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // Add Goal view – step 1
  if (viewMode === 'add-goal') {
    return (
      <div className="gt-page">
        <div className="gt-nav-bar">
          <button className="gt-back-btn" onClick={() => setViewMode('main')}>‹ 返回</button>
          <h1 className="gt-nav-title">添加目标</h1>
        </div>
        <div className="gt-add-goal-content">
          <input
            className="gt-goal-input"
            placeholder="输入你的目标…"
            value={goalInput}
            onChange={e => setGoalInput(e.target.value)}
          />
          <div className="gt-presets">
            {presetGoals.map((p, i) => (
              <button
                key={i}
                className={`gt-bubble ${goalInput === p ? 'selected' : ''}`}
                onClick={() => setGoalInput(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            className="gt-confirm-btn"
            onClick={handleConfirmGoal}
            disabled={!goalInput.trim() || loadingLevelOptions}
          >
            {loadingLevelOptions ? (buildingText || '正在构建水平阶段…') : '确定'}
          </button>
        </div>
      </div>
    );
  }

  // Add Goal view – step 2 (level selection)
  if (viewMode === 'add-level') {
    return (
      <div className="gt-page">
        <div className="gt-nav-bar">
          <button className="gt-back-btn" onClick={() => setViewMode('add-goal')}>‹ 返回</button>
          <h1 className="gt-nav-title">当前水平</h1>
        </div>
        <div className="gt-add-goal-content">
          <p className="gt-level-hint">请选择最贴近你当前实际水平的选项，或在下方直接输入</p>
          <div className="gt-level-cards">
            {levelOptions.map((opt, i) => {
              const keys = Object.keys(opt);
              const optKey = keys.find(k => k.startsWith('option'));
              const detailKey = keys.find(k => k.startsWith('detail'));
              const label = optKey ? opt[optKey] : `选项${i + 1}`;
              const detail = detailKey ? opt[detailKey] : '';
              return (
                <button
                  key={i}
                  className={`gt-level-card ${levelInput === label ? 'selected' : ''}`}
                  onClick={() => { setSelectedLevel(label); setLevelInput(label); }}
                >
                  <span className="gt-level-card-label">{label}</span>
                  {detail && <span className="gt-level-card-detail">{detail}</span>}
                </button>
              );
            })}
          </div>
          <input
            className="gt-goal-input"
            placeholder="或手动输入你的当前水平…"
            value={levelInput}
            onChange={e => setLevelInput(e.target.value)}
          />
          <button
            className="gt-confirm-btn"
            onClick={handleConfirmLevel}
            disabled={!levelInput.trim() && !selectedLevel}
          >
            确定
          </button>
        </div>
      </div>
    );
  }

  // Task Details view
  if (viewMode === 'task-details') {
    const allDone = trainingItems.length > 0 && trainingItems.every(t => t.is_completed);
    return (
      <div className="gt-page">
        <div className="gt-nav-bar">
          <button className="gt-back-btn" onClick={() => { setViewMode('main'); fetchGoals(); }}>‹ 返回</button>
          <h1 className="gt-nav-title">训练细则</h1>
        </div>
        <div className="gt-task-details">
          {selectedGoal && <div className="gt-task-goal-title">{selectedGoal.target_text}</div>}
          {activeSession?.session_target && (
            <div className="gt-task-session-target">本次目标：{activeSession.session_target}</div>
          )}
          <div className="gt-training-list">
            {trainingItems.map((item) => (
              <div
                key={item.id}
                className={`gt-training-item ${item.is_completed ? 'completed' : ''}`}
              >
                <button
                  className="gt-checkbox"
                  onClick={() => handleToggleTraining(item)}
                  aria-label={item.is_completed ? '取消完成' : '标记完成'}
                >
                  {item.is_completed ? '✓' : ''}
                </button>
                <span className="gt-training-desc">{item.description}</span>
                <div className="gt-training-actions">
                  <button
                    className="gt-training-action-btn gt-chat-action"
                    onClick={() => handleOpenTrainingChat(item)}
                    title="AI 对话"
                    aria-label="AI 对话"
                  >
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
                      <path d="M1.5 2A1.5 1.5 0 000 3.5v7A1.5 1.5 0 001.5 12H3v2.25l3-2.25H13.5A1.5 1.5 0 0015 10.5v-7A1.5 1.5 0 0013.5 2h-12z"/>
                    </svg>
                  </button>
                  <button
                    className="gt-training-action-btn gt-practice-action"
                    onClick={() => handleOpenPractice(item)}
                    title="开始练习"
                    aria-label="开始练习"
                  >
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
                      <path d="M3 2.5v10l9-5-9-5z"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
          {allDone && !showCongrats && (
            <div className="gt-all-done-hint">所有训练已完成 🎉</div>
          )}
        </div>
        <div className="gt-task-footer">
          <button className="gt-dismiss-btn" onClick={() => { setViewMode('main'); fetchGoals(); }}>收起</button>
        </div>
        {showCongrats && (
          <div className="gt-overlay">
            <div className="gt-congrats-card">
              <div className="gt-congrats-emoji">🎉</div>
              <div className="gt-congrats-text">恭喜您完成了本次任务</div>
              <button className="gt-confirm-btn" onClick={() => { setShowCongrats(false); setViewMode('main'); fetchGoals(); }}>
                太棒了！
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Practice view
  if (viewMode === 'practice') {
    const typeName = PRACTICE_TYPE_MAP[practiceType] || '综合练习';
    const isCodeEditor = practiceType === 'coding' || practiceType === 'sql';
    return (
      <div className="gt-page gt-practice-page">
        <div className="gt-nav-bar">
          <button className="gt-back-btn" onClick={() => setViewMode('task-details')}>‹ 返回</button>
          <h1 className="gt-nav-title">{typeName}练习</h1>
        </div>
        <div className="gt-practice-container">
          <div className="gt-practice-header">
            <span className="gt-practice-type-tag">{typeName}</span>
            <p className="gt-practice-context">{practiceTraining?.description}</p>
          </div>

          {practicePhase === 'loading' && (
            <div className="gt-practice-loading">
              <div className="gt-practice-spinner" />
              <p>正在生成练习题…</p>
            </div>
          )}

          {practicePhase !== 'loading' && (
            <div className="gt-practice-problem-card">
              <div className="gt-practice-problem-text">{practiceProblem}</div>
            </div>
          )}

          {practicePhase === 'problem' && (
            <div className="gt-practice-answer-section">
              {isCodeEditor && (
                <select
                  className="gt-practice-lang-select"
                  value={practiceLanguage}
                  onChange={e => setPracticeLanguage(e.target.value)}
                >
                  {['Python','JavaScript','TypeScript','Java','C++','C','Go','Rust','Swift','Kotlin','SQL'].map(lang => (
                    <option key={lang} value={lang.toLowerCase()}>{lang}</option>
                  ))}
                </select>
              )}
              <textarea
                className={isCodeEditor ? 'gt-practice-code-editor' : 'gt-practice-text-editor'}
                placeholder={isCodeEditor ? '在此输入代码…' : '在此输入你的答案…'}
                value={practiceAnswer}
                onChange={e => setPracticeAnswer(e.target.value)}
                spellCheck={!isCodeEditor}
              />
              <button
                className="gt-confirm-btn"
                onClick={handleSubmitPractice}
                disabled={!practiceAnswer.trim()}
              >
                提交答案
              </button>
            </div>
          )}

          {practicePhase === 'evaluating' && (
            <div className="gt-practice-loading">
              <div className="gt-practice-spinner" />
              <p>AI 正在批改…</p>
            </div>
          )}

          {practicePhase === 'result' && (
            <div className="gt-practice-result-section">
              <div className="gt-practice-answer-preview">
                <div className="gt-practice-answer-label">你的答案</div>
                <div className={`gt-practice-answer-content${isCodeEditor ? ' code' : ''}`}>{practiceAnswer}</div>
              </div>
              <div className="gt-practice-result-card">
                <div className="gt-practice-result-label">AI 批改</div>
                <div className="gt-practice-result-text">{practiceResult}</div>
              </div>
              <button className="gt-confirm-btn" onClick={handlePracticeAgain}>
                再练一题
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Training Chat view
  if (viewMode === 'training-chat') {    return (
      <div className="gt-page gt-chat-page">
        <div className="gt-nav-bar">
          <button className="gt-back-btn" onClick={() => setViewMode('task-details')}>‹ 返回</button>
          <h1 className="gt-nav-title">训练详情</h1>
        </div>
        <div className="gt-chat-container">
          <div className="gt-chat-pinned">
            <div className="gt-chat-training-title">{chatTraining?.description}</div>
          </div>
          <div className="gt-chat-messages">
            {chatMessages.length === 0 && (
              <div className="gt-chat-hint">你可以提问关于「{chatTraining?.description}」的任何问题</div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`gt-chat-bubble ${msg.role}`}>
                <span>{msg.content}</span>
              </div>
            ))}
            {chatLoading && (
              <div className="gt-chat-bubble assistant loading">
                <span className="gt-typing-dots"><span /><span /><span /></span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="gt-chat-input-row">
            <input
              className="gt-chat-input"
              placeholder="提问…"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
            />
            <button className="gt-chat-send" onClick={handleSendChat} disabled={chatLoading || !chatInput.trim()}>
              发送
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main view
  return (
    <div className="gt-page gt-main">
      <div className="gt-nav-bar">
          <button className="gt-back-btn" onClick={() => navigate('/')}>‹ 工具箱</button>
          <h1 className="gt-nav-title gt-main-title">我的目标</h1>
        </div>

      {loading ? (
        <div className="gt-loading">加载中…</div>
      ) : (
        <div className="gt-goals-list">
          {goals.length === 0 && (
            <div className="gt-empty">还没有目标，点击下方「+」开始添加</div>
          )}
          {goals.map(goal => (
            <GoalItem
              key={goal.id}
              goal={goal}
              onDelete={handleDeleteGoal}
              onHistory={handleOpenHistory}
              onClick={handleGoalClick}
            />
          ))}
          <div className="gt-list-fade" />
        </div>
      )}

      <div className="gt-fab-area">
        <button className="gt-fab" onClick={handleOpenAddGoal} aria-label="添加目标">
          <span className="gt-fab-icon">+</span>
        </button>
      </div>

      {/* Start Task Modal */}
      {showStartModal && selectedGoal && (
        <div className="gt-overlay" onClick={() => setShowStartModal(false)}>
          <div className="gt-start-modal" onClick={e => e.stopPropagation()}>
            <div className="gt-start-modal-title">您当前拥有的训练时间是？</div>
            <div className="gt-time-pickers">
              <div className="gt-time-picker">
                <button className="gt-time-arrow" onClick={() => setTaskHours(h => Math.max(0, h - 1))}>▲</button>
                <div className="gt-time-value">{taskHours}</div>
                <button className="gt-time-arrow" onClick={() => setTaskHours(h => Math.min(23, h + 1))}>▼</button>
                <div className="gt-time-label">小时</div>
              </div>
              <div className="gt-time-picker">
                <button className="gt-time-arrow" onClick={() => setTaskMinutes(m => Math.max(0, m - 5))}>▲</button>
                <div className="gt-time-value">{String(taskMinutes).padStart(2, '0')}</div>
                <button className="gt-time-arrow" onClick={() => setTaskMinutes(m => Math.min(55, m + 5))}>▼</button>
                <div className="gt-time-label">分钟</div>
              </div>
            </div>
            <button
              className="gt-confirm-btn"
              onClick={handleConfirmStartTask}
              disabled={creatingSession}
            >
              确认开始
            </button>
          </div>
        </div>
      )}

      {/* Printing view */}
      {showPrinting && (
        <div className="gt-printing-overlay">
          <div className="gt-task-machine">
            <div className="gt-machine-header">
              <div className="gt-machine-led" />
              <span className="gt-machine-brand-text">ANSUZ PLANNER</span>
            </div>
            <div className="gt-machine-screen">
              {printingLines.map((line, i) => (
                <div key={i} className="gt-machine-line">{line}</div>
              ))}
            </div>
            <div className="gt-machine-slot" />
          </div>
          <div
            className="gt-paper"
            style={{ transform: `translateY(${-(100 - paperProgress)}%)` }}
          >
            <div className="gt-paper-content">
              {printDone && sessionData?.trainingItems.map((t, i) => (
                <div key={t.id} className="gt-paper-item">
                  <span className="gt-paper-check">○</span>
                  <span>{i + 1}. {t.description}</span>
                </div>
              ))}
            </div>
          </div>
          {printDone && (
            <button className="gt-take-paper-btn" onClick={handleTakeTask}>
              取出任务纸
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Level Bubble with long press ─────────────────────────────────────────────

export default GoalTask;
