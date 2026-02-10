import { asyncLlmSubmit } from './asyncLlmService';
import { dbRun, dbGet, dbAll } from './database';
import { logInfo, logError } from './logger';

// All impression dimension keys
const IMPRESSION_DIMENSIONS = [
  '品格', '能力', '动机取向', '情绪特征', '互动体验',
  '价值观', '认知方式', '行为一致性', '社会角色', '边界意识',
  '压力反应', '成长潜力', '风险因素', '总体印象',
];

/**
 * Trigger impression update for a user based on an event.
 * Asynchronously submits to LLM and persists the result.
 */
export const triggerImpressionUpdate = async (
  userId: number,
  event: string,
  eventDetail: string
): Promise<void> => {
  try {
    // Get current impression
    const current = await dbGet(
      'SELECT dimensions FROM user_impressions WHERE user_id = ?',
      [userId]
    );
    const currentDimensions = current ? JSON.parse(current.dimensions) : {};

    // Get MBTI results for richer context
    const mbtiResults = await dbAll(
      'SELECT mbti_type, scores, ai_analysis FROM mbti_results WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    let mbtiContext = '';
    if (mbtiResults.length > 0) {
      const mbti = mbtiResults[0];
      const scores = JSON.parse(mbti.scores);
      mbtiContext = `\n\n用户的MBTI类型：${mbti.mbti_type}，各维度分值：E/I=${scores.EI}, S/N=${scores.SN}, T/F=${scores.TF}, J/P=${scores.JP}。`;
      if (mbti.ai_analysis) {
        mbtiContext += `\nMBTI AI详细分析：${mbti.ai_analysis}`;
      }
    }

    const systemPrompt = `你是一个用户画像分析专家。根据用户行为事件和所有可用信息，更新用户印象的各个维度。
请基于现有印象数据、新事件以及MBTI分析结果，尽可能全面地填充所有维度。

维度列表：${IMPRESSION_DIMENSIONS.join('、')}

重要要求：
1. 每个维度的值应该是简练的描述（不超过15个字）。
2. 尽量根据MBTI类型和AI分析结果推断并填充所有维度，而不仅仅是直接相关的维度。
3. MBTI各维度（E/I外向内向、S/N感觉直觉、T/F思维情感、J/P判断知觉）与印象维度有密切关联，请充分利用这些信息。
4. 如果某维度已有数据，可以根据新信息进行优化；如果某维度尚无数据，请尽力根据已有信息推断。

严格输出纯JSON格式，不要包含markdown标记或其他文字。示例：
{"品格":"诚实自律","能力":"学习能力强","认知方式":"直觉型思维"}`;

    const userMessage = `当前用户印象：${JSON.stringify(currentDimensions)}

新事件：${event}
事件详情：${eventDetail}${mbtiContext}

请输出更新后的完整印象JSON，尽量填充所有维度。`;

    asyncLlmSubmit(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      async (content: string) => {
        try {
          // Try to extract JSON from content
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            logError('impression_parse_no_json', new Error('No JSON found in LLM response'), { content });
            return;
          }
          const updatedDimensions = JSON.parse(jsonMatch[0]);

          // Upsert impression
          const dimensionsJson = JSON.stringify(updatedDimensions);
          await dbRun(
            `INSERT INTO user_impressions (user_id, dimensions, updated_at)
             VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(user_id) DO UPDATE SET dimensions = ?, updated_at = CURRENT_TIMESTAMP`,
            [userId, dimensionsJson, dimensionsJson]
          );

          logInfo('impression_updated', { userId, event });

          // Generate overview after impression update
          await generateImpressionOverview(userId, updatedDimensions);
        } catch (parseErr) {
          logError('impression_update_parse_error', parseErr as Error, { content });
        }
      },
      'impression_update'
    );
  } catch (error) {
    logError('trigger_impression_error', error as Error, { userId, event });
  }
};

/**
 * Generate a concise overview (≤100 chars) of user impression.
 */
export const generateImpressionOverview = async (
  userId: number,
  dimensions: Record<string, string>
): Promise<void> => {
  const systemPrompt = `你是一个用户画像概览生成器。请根据用户的印象维度数据，生成一段不超过100字的简练概览，用于展示给其他用户。
只输出概览文字，不要其他内容。`;

  const userMessage = `用户印象维度：${JSON.stringify(dimensions)}

请生成不超过100字的概览。`;

  asyncLlmSubmit(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    async (content: string) => {
      const overview = content.trim().slice(0, 100);
      await dbRun(
        `UPDATE user_impressions SET overview = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
        [overview, userId]
      );
      logInfo('impression_overview_generated', { userId, overviewLength: overview.length });
    },
    'impression_overview'
  );
};

/**
 * Trigger matching for a user against all other users.
 * Respects per-user weekly cooldown (7 days from last match).
 * Only triggered after MBTI test completion.
 */
export const triggerUserMatching = async (userId: number): Promise<void> => {
  await triggerUserMatchingWithCooldown(userId, 7 * 24 * 60 * 60 * 1000, 'weekly');
};

/**
 * Trigger matching with daily cooldown (24 hours).
 * Used after saving private info.
 */
export const triggerUserMatchingDaily = async (userId: number): Promise<void> => {
  await triggerUserMatchingWithCooldown(userId, 24 * 60 * 60 * 1000, 'daily');
};

/**
 * Internal: Trigger matching for a user with configurable cooldown.
 */
const triggerUserMatchingWithCooldown = async (
  userId: number,
  cooldownMs: number,
  source: string
): Promise<void> => {
  try {
    // Check cooldown per user
    const cooldown = await dbGet(
      'SELECT last_match_at FROM match_cooldown WHERE user_id = ?',
      [userId]
    );

    if (cooldown) {
      const lastMatch = new Date(cooldown.last_match_at).getTime();
      if (Date.now() - lastMatch < cooldownMs) {
        logInfo('matching_cooldown_active', {
          userId,
          source,
          lastMatchAt: cooldown.last_match_at,
        });
        return;
      }
    }

    // Get current user impression
    const userImpression = await dbGet(
      'SELECT dimensions FROM user_impressions WHERE user_id = ?',
      [userId]
    );
    if (!userImpression) {
      logInfo('matching_skip_no_impression', { userId });
      return;
    }

    // Get user's private info if available
    const userPrivateInfo = await dbGet(
      'SELECT appearance, extra FROM user_private_info WHERE user_id = ?',
      [userId]
    );

    // Get all other users with impressions
    const otherUsers = await dbAll(
      `SELECT ui.user_id, ui.dimensions, upi.appearance, upi.extra
       FROM user_impressions ui
       LEFT JOIN user_private_info upi ON ui.user_id = upi.user_id
       WHERE ui.user_id != ?`,
      [userId]
    );

    if (otherUsers.length === 0) {
      logInfo('matching_skip_no_other_users', { userId });
      return;
    }

    // Update cooldown
    await dbRun(
      `INSERT INTO match_cooldown (user_id, last_match_at)
       VALUES (?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET last_match_at = CURRENT_TIMESTAMP`,
      [userId]
    );

    logInfo('matching_started', { userId, otherUserCount: otherUsers.length });

    // Match against each other user asynchronously
    for (const other of otherUsers) {
      matchTwoUsers(
        userId,
        JSON.parse(userImpression.dimensions),
        userPrivateInfo,
        other.user_id,
        JSON.parse(other.dimensions),
        other
      );
    }
  } catch (error) {
    logError('trigger_matching_error', error as Error, { userId });
  }
};

const MATCHING_DIMENSIONS = [
  '吸引触发', '价值共鸣', '互补关系', '相似性', '安全感',
  '情绪联结', '互动顺畅', '依赖与需要', '时机因素', '风险接受',
  '权力结构', '投入对等', '信任基础', '社会环境', '长期潜力',
];

/**
 * Match two users using LLM and store the result.
 */
const matchTwoUsers = (
  userIdA: number,
  dimensionsA: Record<string, string>,
  privateInfoA: any,
  userIdB: number,
  dimensionsB: Record<string, string>,
  privateInfoB: any
): void => {
  const systemPrompt = `你是一个社交配对分析专家。请根据两个用户的印象数据，从以下维度对他们的配对进行评分和分析。

配对维度：${MATCHING_DIMENSIONS.join('、')}

请为每个维度打分（0-10），并计算总分（各维度分数之和）。
严格输出纯JSON格式，示例：
{"scores":{"吸引触发":5,"价值共鸣":7},"total":80,"summary":"简要配对评语不超过50字"}`;

  const userMessage = `用户A的印象：${JSON.stringify(dimensionsA)}
${privateInfoA?.appearance ? `用户A的外貌描述：${privateInfoA.appearance}` : ''}

用户B的印象：${JSON.stringify(dimensionsB)}
${privateInfoB?.appearance ? `用户B的外貌描述：${privateInfoB.appearance}` : ''}

请进行配对分析。`;

  asyncLlmSubmit(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    async (content: string) => {
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          logError('match_parse_no_json', new Error('No JSON in match response'), { content });
          return;
        }
        const result = JSON.parse(jsonMatch[0]);
        const score = result.total || 0;
        const dimensionsJson = JSON.stringify(result);

        // Upsert match (store for both directions with same data)
        const [idA, idB] = userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];

        await dbRun(
          `INSERT INTO user_matches (user_id_a, user_id_b, score, dimensions, updated_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id_a, user_id_b) DO UPDATE SET score = ?, dimensions = ?, updated_at = CURRENT_TIMESTAMP`,
          [idA, idB, score, dimensionsJson, score, dimensionsJson]
        );

        logInfo('match_completed', { userIdA, userIdB, score });
      } catch (parseErr) {
        logError('match_parse_error', parseErr as Error, { content });
      }
    },
    'user_matching'
  );
};
