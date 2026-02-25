import type { Tool } from '../types/index';

export type PredefinedTool = Omit<Tool, 'id' | 'user_id' | 'created_at'> & { url: string };

/**
 * Master catalogue of all available tools in the toolbox.
 * When adding a new tool to the application, add its entry here.
 * This array is the single source of truth used by the AddToolModal
 * and any other feature (e.g. AI-powered search) that needs the full list.
 */
export const PREDEFINED_TOOLS: PredefinedTool[] = [
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
];
