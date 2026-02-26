import React from 'react';
import type { Tool } from '../types/index';
import '../styles/Modal.css';

interface AddToolModalProps {
  onClose: () => void;
  onAdd: (tool: Omit<Tool, 'id' | 'user_id' | 'created_at'>) => void;
  existingTools?: Tool[];
  highlightToolName?: string;
}

// Predefined tools that users can quickly add
const PREDEFINED_TOOLS = [
  {
    name: '股票预测',
    description: '记录和分析股票预测结果，提供准确率统计和可视化分析',
    url: '/stock-prediction',
    tags: ['投资', '分析', '数据'],
  },
  {
    name: 'AI+MBTI性格测试',
    description: 'AI驱动的MBTI人格类型测试，64道专业题目，支持滑动条评分，提供基于分值和AI双重分析',
    url: '/mbti-test',
    tags: ['AI', '心理', '测试', 'MBTI'],
  },
  {
    name: '缘分罗盘',
    description: 'MBTI人格 × 星座能量 × 八字命理 三重融合匹配，发现你命中注定的灵魂搭档',
    url: '/friend-match',
    tags: ['社交', '交友', 'AI'],
  },
  {
    name: '数独游戏',
    description: '经典数独益智游戏，支持简单/中等/困难三种难度，提供笔记模式和计时功能',
    url: '/sudoku',
    tags: ['游戏', '益智', '数独'],
  },
  {
    name: '斗地主',
    description: '经典斗地主扑克牌游戏，支持叫地主、抢地主，与AI对手智能对战',
    url: '/doudizhu',
    tags: ['游戏', '扑克', '斗地主'],
  },
  {
    name: '目标任务',
    description: 'AI驱动的目标拆分与训练计划生成工具，输入目标后自动评估当前水平并逐步生成可执行的训练任务',
    url: '/goal-task',
    tags: ['AI', '目标', '任务', '训练'],
  },
  {
    name: '吉他练习助手',
    description: '吉他练习工具，内置和弦指法图、歌词和弦标注、音频播放器，支持自定义歌曲和导入导出',
    url: '/guitar-practice',
    tags: ['音乐', '吉他', '练习', '和弦'],
  },
  {
    name: '病例记录',
    description: 'AI辅助病例记录工具，记录病情及对应处理方式，自动生成分类标签，支持公开分享供他人参考',
    url: '/medical-record',
    tags: ['健康', '医疗', 'AI', '记录'],
  },
];

const AddToolModal: React.FC<AddToolModalProps> = ({ onClose, onAdd, existingTools = [], highlightToolName }) => {
  // Filter out predefined tools that the user has already added
  const availablePredefinedTools = PREDEFINED_TOOLS.filter(
    (pt) => !existingTools.some((et) => et.name === pt.name && et.url === pt.url)
  );

  const handleSelectPredefined = (predefinedTool: typeof PREDEFINED_TOOLS[0]) => {
    onAdd({
      name: predefinedTool.name,
      description: predefinedTool.description,
      url: predefinedTool.url,
      tags: predefinedTool.tags,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>添加工具</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="predefined-tools-section">
          {availablePredefinedTools.length > 0 ? (
            <div className="predefined-tools-list">
              {availablePredefinedTools.map((tool, index) => (
                <div
                  key={index}
                  className={`predefined-tool-item${highlightToolName === tool.name ? ' predefined-tool-highlight' : ''}`}
                  onClick={() => handleSelectPredefined(tool)}
                >
                  <h4>{tool.name}</h4>
                  <p>{tool.description}</p>
                  <div className="tool-tags-preview">
                    {tool.tags.map((tag, idx) => (
                      <span key={idx} className="tag-preview">{tag}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-tools-tip">暂无未添加工具</p>
          )}
        </div>

        <div className="modal-actions" style={{ padding: '1rem 1.5rem' }}>
          <button onClick={onClose} className="btn btn-secondary">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddToolModal;
