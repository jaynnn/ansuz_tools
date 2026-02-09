import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import '../styles/MBTIAnalysisReport.css';

interface MBTIAnalysisReportProps {
  aiResult: string;
  scores: { EI: number; SN: number; TF: number; JP: number };
  mbtiType: string;
  totalQuestions: number;
}

const DIMENSION_META: Record<string, { left: string; leftLabel: string; right: string; rightLabel: string; color: string }> = {
  EI: { left: 'I', leftLabel: '内向', right: 'E', rightLabel: '外向', color: '#6366f1' },
  SN: { left: 'N', leftLabel: '直觉', right: 'S', rightLabel: '感觉', color: '#f59e0b' },
  TF: { left: 'F', leftLabel: '情感', right: 'T', rightLabel: '思考', color: '#10b981' },
  JP: { left: 'P', leftLabel: '感知', right: 'J', rightLabel: '判断', color: '#ef4444' },
};

const MBTIAnalysisReport: React.FC<MBTIAnalysisReportProps> = ({
  aiResult,
  scores,
  mbtiType,
  totalQuestions,
}) => {
  const radarData = useMemo(() => {
    const questionsPerDim = Math.ceil(totalQuestions / 4);
    const maxScore = questionsPerDim * 3;
    return [
      { dimension: '外向 E', value: Math.max(0, scores.EI) / maxScore * 100, fullMark: 100 },
      { dimension: '直觉 N', value: Math.max(0, -scores.SN) / maxScore * 100, fullMark: 100 },
      { dimension: '情感 F', value: Math.max(0, -scores.TF) / maxScore * 100, fullMark: 100 },
      { dimension: '感知 P', value: Math.max(0, -scores.JP) / maxScore * 100, fullMark: 100 },
      { dimension: '内向 I', value: Math.max(0, -scores.EI) / maxScore * 100, fullMark: 100 },
      { dimension: '感觉 S', value: Math.max(0, scores.SN) / maxScore * 100, fullMark: 100 },
      { dimension: '思考 T', value: Math.max(0, scores.TF) / maxScore * 100, fullMark: 100 },
      { dimension: '判断 J', value: Math.max(0, scores.JP) / maxScore * 100, fullMark: 100 },
    ];
  }, [scores, totalQuestions]);

  const barData = useMemo(() => {
    const questionsPerDim = Math.ceil(totalQuestions / 4);
    const maxScore = questionsPerDim * 3;
    return Object.entries(DIMENSION_META).map(([key, meta]) => {
      const rawScore = scores[key as keyof typeof scores];
      const pct = Math.round((Math.abs(rawScore) / maxScore) * 100);
      const dominant = rawScore >= 0 ? meta.right : meta.left;
      const dominantLabel = rawScore >= 0 ? meta.rightLabel : meta.leftLabel;
      return {
        dimension: `${meta.left}/${meta.right}`,
        label: `${dominantLabel} (${dominant})`,
        value: pct,
        dominant,
        dominantLabel,
        color: meta.color,
        rawScore,
      };
    });
  }, [scores, totalQuestions]);

  return (
    <div className="mbti-report">
      {/* Type Header */}
      <div className="mbti-report-header">
        <div className="mbti-report-type-badge">
          {mbtiType.split('').map((letter, i) => (
            <span key={i} className="mbti-report-letter" style={{ color: Object.values(DIMENSION_META)[i]?.color }}>
              {letter}
            </span>
          ))}
        </div>
        <div className="mbti-report-subtitle">AI 深度人格分析报告</div>
      </div>

      {/* Charts Section */}
      <div className="mbti-report-charts">
        {/* Radar Chart */}
        <div className="mbti-report-chart-card">
          <h4>人格维度雷达图</h4>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="dimension" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                name="倾向强度"
                dataKey="value"
                stroke="#6366f1"
                fill="#6366f1"
                fillOpacity={0.25}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Dimension Bar Chart */}
        <div className="mbti-report-chart-card">
          <h4>各维度倾向强度</h4>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData} layout="vertical" margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} unit="%" />
              <YAxis type="category" dataKey="label" width={80} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                }}
                formatter={(value) => [`${value}%`, '倾向强度']}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={24}>
                {barData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Dimension Summary Cards */}
      <div className="mbti-report-dimensions">
        {Object.entries(DIMENSION_META).map(([key, meta]) => {
          const rawScore = scores[key as keyof typeof scores];
          const questionsPerDim = Math.ceil(totalQuestions / 4);
          const maxScore = questionsPerDim * 3;
          const pct = Math.round((Math.abs(rawScore) / maxScore) * 100);
          const dominant = rawScore >= 0 ? meta.right : meta.left;
          const dominantLabel = rawScore >= 0 ? meta.rightLabel : meta.leftLabel;
          return (
            <div className="mbti-report-dim-card" key={key} style={{ borderLeftColor: meta.color }}>
              <div className="mbti-report-dim-header">
                <span className="mbti-report-dim-letter" style={{ background: meta.color }}>{dominant}</span>
                <span className="mbti-report-dim-name">{dominantLabel}</span>
                <span className="mbti-report-dim-axis">{meta.left}/{meta.right}</span>
              </div>
              <div className="mbti-report-dim-bar-wrap">
                <div className="mbti-report-dim-bar">
                  <div className="mbti-report-dim-fill" style={{ width: `${pct}%`, background: meta.color }} />
                </div>
                <span className="mbti-report-dim-pct">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Analysis Content */}
      <div className="mbti-report-content">
        <div className="mbti-report-section-title">
          <span className="mbti-report-section-icon">🤖</span>
          AI 详细分析
        </div>
        <div className="mbti-report-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {aiResult}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

export default MBTIAnalysisReport;
