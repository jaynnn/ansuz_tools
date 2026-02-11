import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { mbtiQuestions } from '../data/mbtiQuestions';
import { mbtiAPI } from '../api';
import MBTIAnalysisReport from '../components/MBTIAnalysisReport';
import '../styles/MBTITest.css';

const SLIDER_LABELS = ['非常不同意', '不同意', '略微不同意', '中立', '略微同意', '同意', '非常同意'];

const MBTI_TYPES: Record<string, { name: string; description: string }> = {
  ISTJ: { name: '检查员', description: '安静、严肃，通过全面性和可靠性来达成目标。实际、有序、注重事实、逻辑和现实。对所做的一切都很负责，做事有条不紊。' },
  ISFJ: { name: '守护者', description: '安静、友善、有责任感和良知。坚定地致力于履行自己的义务。彻底、勤恳、精确，忠诚、体贴，关注他人的感受。' },
  INFJ: { name: '提倡者', description: '寻求思想、关系和物质之间的意义和联系。希望了解什么能激励他人，对人有洞察力。有责任心，坚持自己的价值观。' },
  INTJ: { name: '建筑师', description: '在实现自己的想法和达成目标方面有创新的驱动力。能迅速洞察外部事件的规律，并形成长期的全局规划。' },
  ISTP: { name: '鉴赏家', description: '灵活、容忍，是安静的观察者，直到问题出现，然后迅速行动找到可行的解决方案。善于分析事物运作的原理。' },
  ISFP: { name: '探险家', description: '安静、友善、敏感、善良。享受当下的一切。喜欢拥有自己的空间，按自己的时间表工作。忠诚且有承诺。' },
  INFP: { name: '调停者', description: '理想主义，对自己重视的人或事业忠诚。希望外部生活与内在价值观一致。好奇心强，能迅速发现各种可能性。' },
  INTP: { name: '逻辑学家', description: '对自己感兴趣的任何事物都寻求逻辑解释。喜欢理论和抽象的东西，热衷于思考而非社交。安静、内敛、灵活、适应力强。' },
  ESTP: { name: '企业家', description: '灵活且容忍，采取务实的方法，专注于取得成果。厌倦理论和概念解释，想要果断地行动来解决问题。' },
  ESFP: { name: '表演者', description: '外向、友善、接受力强。热爱生活、人和物质享受。喜欢与他人合作完成事情。在工作中运用常识和现实的态度。' },
  ENFP: { name: '竞选者', description: '热情洋溢、富有想象力。认为生活充满了可能性。能迅速将事件和信息联系起来，并自信地根据看到的模式行事。' },
  ENTP: { name: '辩论家', description: '聪明、机智，善于很多事情。有激励力，善于直言不讳。善于解决新的和有挑战性的问题，善于从战略上分析。' },
  ESTJ: { name: '总经理', description: '实际、现实、注重事实。果断，一旦做出决定就会迅速采取行动。善于组织项目和人员来完成工作，注重效率。' },
  ESFJ: { name: '执政官', description: '热心、有责任心、乐于合作。希望环境和谐，并坚定地努力建立和谐。喜欢与他人合作，准确及时地完成任务。' },
  ENFJ: { name: '主人公', description: '温暖、有同理心、响应迅速、负责任。高度关注他人的情感和需求。善于发现每个人的潜力，并希望帮助他人实现。' },
  ENTJ: { name: '指挥官', description: '坦率、果断，善于领导。能迅速发现不合逻辑和低效的程序和政策，并制定全面的系统来解决组织问题。' },
};

type Phase = 'welcome' | 'test' | 'results';

interface HistoryItem {
  id: number;
  mbti_type: string;
  scores: { EI: number; SN: number; TF: number; JP: number };
  hasAiAnalysis: boolean;
  created_at: string;
}

interface HistoryDetail {
  id: number;
  mbti_type: string;
  scores: { EI: number; SN: number; TF: number; JP: number };
  answers: Array<{ questionId: number; dimension: string; direction: string; value: number }>;
  ai_analysis: string | null;
  model: string | null;
  created_at: string;
}

const MBTITest: React.FC = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('welcome');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>(() => new Array(mbtiQuestions.length).fill(0));
  const [activeTab, setActiveTab] = useState<'score' | 'ai'>('score');
  const [aiResult, setAiResult] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string>('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewingHistory, setViewingHistory] = useState<HistoryDetail | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await mbtiAPI.getHistory();
      setHistory(data);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = 'MBTI测试 - 工具箱';
    loadHistory();
  }, [loadHistory]);
  const autoAdvanceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (autoAdvanceTimer.current) {
        clearTimeout(autoAdvanceTimer.current);
      }
    };
  }, []);

  const handleSliderChange = useCallback((value: number) => {
    setAnswers(prev => {
      const next = [...prev];
      next[currentIndex] = value;
      return next;
    });
    // Auto-advance to next question after user stops interacting
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
    }
    if (currentIndex < mbtiQuestions.length - 1) {
      autoAdvanceTimer.current = setTimeout(() => {
        setCurrentIndex(prev => Math.min(prev + 1, mbtiQuestions.length - 1));
      }, 400);
    }
  }, [currentIndex]);

  const scores = useMemo(() => {
    let EI = 0, SN = 0, TF = 0, JP = 0;
    mbtiQuestions.forEach((q, i) => {
      const v = answers[i];
      const sign = (['E', 'S', 'T', 'J'].includes(q.direction)) ? 1 : -1;
      const score = v * sign;
      switch (q.dimension) {
        case 'EI': EI += score; break;
        case 'SN': SN += score; break;
        case 'TF': TF += score; break;
        case 'JP': JP += score; break;
      }
    });
    return { EI, SN, TF, JP };
  }, [answers]);

  const mbtiType = useMemo(() => {
    const e = scores.EI >= 0 ? 'E' : 'I';
    const s = scores.SN >= 0 ? 'S' : 'N';
    const t = scores.TF >= 0 ? 'T' : 'F';
    const j = scores.JP >= 0 ? 'J' : 'P';
    return `${e}${s}${t}${j}`;
  }, [scores]);

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const handleSubmit = async () => {
    setPhase('results');
    setViewingHistory(null);
    // Auto-save score result
    try {
      const payload = answers.map((value, index) => ({
        questionId: mbtiQuestions[index].id,
        dimension: mbtiQuestions[index].dimension,
        direction: mbtiQuestions[index].direction,
        value,
      }));
      await mbtiAPI.save({ mbtiType: mbtiType, scores, answers: payload });
      loadHistory();
    } catch (err) {
      console.error('Failed to save result:', err);
    }
  };

  const handleAIAnalyze = async () => {
    setAiLoading(true);
    setAiError('');
    setAiResult('');
    try {
      let payload: Array<{ questionId: number; dimension: string; direction: string; value: number }>;
      let analyzeScores: { EI: number; SN: number; TF: number; JP: number };

      if (viewingHistory) {
        payload = viewingHistory.answers;
        analyzeScores = viewingHistory.scores;
      } else {
        payload = answers.map((value, index) => ({
          questionId: mbtiQuestions[index].id,
          dimension: mbtiQuestions[index].dimension,
          direction: mbtiQuestions[index].direction,
          value,
        }));
        analyzeScores = scores;
      }

      const data = await mbtiAPI.analyze(payload, analyzeScores);
      setAiResult(data.llmAnalysis || data.analysis || data.result || '分析完成，但未返回结果内容。');
      loadHistory();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '分析请求失败，请稍后重试';
      setAiError(message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleRestart = () => {
    setPhase('welcome');
    setCurrentIndex(0);
    setAnswers(new Array(mbtiQuestions.length).fill(0));
    setActiveTab('score');
    setAiResult('');
    setAiError('');
    setViewingHistory(null);
    loadHistory();
  };

  const handleViewHistory = async (id: number) => {
    try {
      const detail: HistoryDetail = await mbtiAPI.getById(id);
      setViewingHistory(detail);
      setAiResult(detail.ai_analysis || '');
      setAiError('');
      setActiveTab(detail.ai_analysis ? 'ai' : 'score');
      setPhase('results');
    } catch (err) {
      console.error('Failed to load history detail:', err);
    }
  };

  const handleDeleteHistory = async (id: number) => {
    try {
      await mbtiAPI.deleteResult(id);
      setHistory(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error('Failed to delete history:', err);
    }
  };

  const renderDimensionBar = (
    dim: string,
    leftLetter: string,
    leftLabel: string,
    rightLetter: string,
    rightLabel: string,
    score: number,
  ) => {
    const questionsPerDimension = mbtiQuestions.filter(q => q.dimension === dim).length;
    const maxScore = questionsPerDimension * 3;
    const pct = Math.min(Math.abs(score) / maxScore, 1) * 50;
    const isLeft = score < 0;
    const fillStyle = isLeft
      ? { right: '50%', width: `${pct}%` }
      : { left: '50%', width: `${pct}%` };
    const activeIsLeft = score < 0;
    return (
      <div className="mbti-dimension-bar" key={dim}>
        <div className="mbti-dimension-labels">
          <span className={`left-label ${activeIsLeft ? 'active-label' : ''}`}>
            {leftLetter} - {leftLabel}
          </span>
          <span className={`right-label ${!activeIsLeft ? 'active-label' : ''}`}>
            {rightLetter} - {rightLabel}
          </span>
        </div>
        <div className="mbti-bar-track">
          <div className="mbti-bar-center" />
          <div className="mbti-bar-fill" style={fillStyle} />
        </div>
        <div className="mbti-dimension-score">
          {score > 0 ? `+${score}` : score} ({score >= 0 ? rightLetter : leftLetter})
        </div>
      </div>
    );
  };

  // Use history data when viewing a saved result, otherwise use current test data
  const displayScores = viewingHistory ? viewingHistory.scores : scores;
  const displayType = viewingHistory ? viewingHistory.mbti_type : mbtiType;

  return (
    <div className="mbti-page">
      <div className="mbti-header">
        <h1>MBTI 性格测试</h1>
        <button className="btn-back" onClick={() => navigate('/')}>返回首页</button>
      </div>

      {phase === 'welcome' && (
        <div className="mbti-welcome">
          <h2>欢迎参加 MBTI 性格测试</h2>
          <p>本测试包含 {mbtiQuestions.length} 道题目，通过滑动条来评估你对每个描述的认同程度。</p>
          <p>测试完成后，你将获得基于分值的性格类型结果，并可选择使用 AI 进行深度分析。</p>
          <p>请根据你的真实感受作答，没有对错之分。</p>
          <button className="btn-start" onClick={() => setPhase('test')}>开始测试</button>

          {history.length > 0 && (
            <div className="mbti-history">
              <h3>历史测试记录</h3>
              {historyLoading ? (
                <p className="mbti-history-loading">加载中...</p>
              ) : (
                <div className="mbti-history-list">
                  {history.map(item => (
                    <div className="mbti-history-item" key={item.id}>
                      <div className="mbti-history-info" onClick={() => handleViewHistory(item.id)}>
                        <span className="mbti-history-type">{item.mbti_type}</span>
                        <span className="mbti-history-name">{MBTI_TYPES[item.mbti_type]?.name || ''}</span>
                        {item.hasAiAnalysis && <span className="mbti-history-ai-badge">AI</span>}
                        <span className="mbti-history-date">{new Date(item.created_at).toLocaleString()}</span>
                      </div>
                      <button
                        className="mbti-history-delete"
                        onClick={(e) => { e.stopPropagation(); handleDeleteHistory(item.id); }}
                        title="删除"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {phase === 'test' && (
        <>
          <div className="mbti-progress">
            <div className="mbti-progress-info">
              <span>第 {currentIndex + 1} / {mbtiQuestions.length} 题</span>
              <span>{Math.round(((currentIndex + 1) / mbtiQuestions.length) * 100)}%</span>
            </div>
            <div className="mbti-progress-bar">
              <div
                className="mbti-progress-fill"
                style={{ width: `${((currentIndex + 1) / mbtiQuestions.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="mbti-question">
            <div className="mbti-question-text">
              {mbtiQuestions[currentIndex].text}
            </div>

            <div className="mbti-slider">
              <div className="mbti-slider-track">
                <input
                  type="range"
                  min={-3}
                  max={3}
                  step={1}
                  value={answers[currentIndex]}
                  onChange={e => handleSliderChange(Number(e.target.value))}
                />
              </div>
              <div className="mbti-slider-ticks">
                {SLIDER_LABELS.map((_, i) => <span key={i} />)}
              </div>
              <div className="mbti-slider-labels">
                {SLIDER_LABELS.map((label, i) => <span key={i}>{label}</span>)}
              </div>
              <div className="mbti-slider-value">
                {SLIDER_LABELS[Math.min(Math.max(answers[currentIndex] + 3, 0), SLIDER_LABELS.length - 1)]}
              </div>
            </div>
          </div>

          <div className="mbti-navigation">
            <button
              className="btn-prev"
              onClick={handlePrev}
              disabled={currentIndex === 0}
            >
              上一题
            </button>
            {currentIndex === mbtiQuestions.length - 1 && (
              <button className="btn-submit" onClick={handleSubmit}>提交并查看结果</button>
            )}
          </div>
        </>
      )}

      {phase === 'results' && (
        <div className="mbti-results">
          <div className="mbti-tabs">
            <button
              className={activeTab === 'score' ? 'active' : ''}
              onClick={() => setActiveTab('score')}
            >
              分值结果
            </button>
            <button
              className={activeTab === 'ai' ? 'active' : ''}
              onClick={() => setActiveTab('ai')}
            >
              AI 深度分析
            </button>
          </div>

          {activeTab === 'score' && (
            <>
              <div className="mbti-type-badge">
                <div className="mbti-type-letters">{displayType}</div>
                <div className="mbti-type-name">{MBTI_TYPES[displayType]?.name}</div>
                <div className="mbti-type-description">{MBTI_TYPES[displayType]?.description}</div>
              </div>

              <div className="mbti-dimensions">
                <h3>各维度得分</h3>
                {renderDimensionBar('EI', 'I', '内向', 'E', '外向', displayScores.EI)}
                {renderDimensionBar('SN', 'N', '直觉', 'S', '感觉', displayScores.SN)}
                {renderDimensionBar('TF', 'F', '情感', 'T', '思考', displayScores.TF)}
                {renderDimensionBar('JP', 'P', '感知', 'J', '判断', displayScores.JP)}
              </div>
            </>
          )}

          {activeTab === 'ai' && (
            <div className="mbti-ai-section">
              {!aiResult && !aiLoading && (
                <>
                  <h3>AI 深度分析</h3>
                  <p>基于你的 {mbtiQuestions.length} 道题目回答，AI 将对你的性格特征进行全面深度分析。</p>
                  <button
                    className="btn-ai-analyze"
                    onClick={handleAIAnalyze}
                    disabled={aiLoading}
                  >
                    开始 AI 分析
                  </button>
                </>
              )}

              {aiLoading && (
                <div className="mbti-ai-loading">
                  <div className="spinner" />
                  <p>AI 正在分析你的回答，请稍候...</p>
                </div>
              )}

              {aiResult && (
                <MBTIAnalysisReport
                  aiResult={aiResult}
                  scores={displayScores}
                  mbtiType={displayType}
                  totalQuestions={mbtiQuestions.length}
                />
              )}

              {aiError && (
                <div className="mbti-ai-error">{aiError}</div>
              )}
            </div>
          )}

          <div className="mbti-restart">
            <button className="btn-restart" onClick={handleRestart}>重新测试</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MBTITest;
