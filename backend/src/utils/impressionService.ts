import { asyncLlmSubmit } from './asyncLlmService';
import { dbRun, dbGet, dbAll } from './database';
import { logInfo, logError } from './logger';
import { generateAstrologyContext } from './astrology';

/**
 * Extract birth date/time from user's private info extra JSON and generate astrology context.
 */
const getAstrologyContextFromExtra = (extra: string | undefined): string => {
  if (!extra) return '';
  try {
    const parsed = JSON.parse(extra);
    const birthDate = parsed.birthDate;
    const birthTime = parsed.birthTime;
    if (!birthDate) return '';
    return generateAstrologyContext(birthDate, birthTime || undefined);
  } catch {
    return '';
  }
};

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
      try {
        const scores = JSON.parse(mbti.scores);
        mbtiContext = `\n\n用户的MBTI类型：${mbti.mbti_type}，各维度分值：E/I=${scores.EI}, S/N=${scores.SN}, T/F=${scores.TF}, J/P=${scores.JP}。`;
      } catch {
        mbtiContext = `\n\n用户的MBTI类型：${mbti.mbti_type}。`;
      }
      if (mbti.ai_analysis) {
        mbtiContext += `\nMBTI AI详细分析：${mbti.ai_analysis}`;
      }
    }

    // Get astrology context from private info
    const privateInfoRow = await dbGet(
      'SELECT extra FROM user_private_info WHERE user_id = ?',
      [userId]
    );
    const astrologyCtx = getAstrologyContextFromExtra(privateInfoRow?.extra);
    let astrologyContext = '';
    if (astrologyCtx) {
      astrologyContext = `\n\n用户命理信息：${astrologyCtx}`;
    }

    const systemPrompt = `你是一个用户画像分析专家。根据用户行为事件和所有可用信息，更新用户印象的各个维度。
请基于现有印象数据、新事件、MBTI分析结果以及命理信息（如有），尽可能全面地填充所有维度。

维度列表：${IMPRESSION_DIMENSIONS.join('、')}

重要要求：
1. 每个维度的值应该是简练的描述（不超过15个字）。
2. 尽量根据MBTI类型和AI分析结果推断并填充所有维度，而不仅仅是直接相关的维度。
3. MBTI各维度（E/I外向内向、S/N感觉直觉、T/F思维情感、J/P判断知觉）与印象维度有密切关联，请充分利用这些信息。
4. 如果有命理信息（星座、生辰八字、五行等），可以作为辅助参考，略微结合命理学特征来丰富描述，但不要过度依赖。
5. 如果某维度已有数据，可以根据新信息进行优化；如果某维度尚无数据，请尽力根据已有信息推断。
6. 描述必须客观事实，不要使用"非凡"、"卓越"、"出色"等夸张修饰词，用平实的语言。
7. 不允许无中生有或过度美化，缺点也应如实描述。

严格输出纯JSON格式，不要包含markdown标记或其他文字。示例：
{"品格":"诚实自律","能力":"学习能力强","认知方式":"直觉型思维"}`;

    const userMessage = `当前用户印象：${JSON.stringify(currentDimensions)}

新事件：${event}
事件详情：${eventDetail}${mbtiContext}${astrologyContext}

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
 * Generate readable, attractive overviews of user impression.
 * Combines impression dimensions, MBTI results, and private info.
 * Generates two versions:
 * - overview_self: first-person perspective for the user themselves
 * - overview: third-person perspective for other users (gender-aware)
 */
export const generateImpressionOverview = async (
  userId: number,
  dimensions: Record<string, string>
): Promise<void> => {
  try {
    // Gather MBTI results
    const mbtiResults = await dbAll(
      'SELECT mbti_type, scores, ai_analysis FROM mbti_results WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    let mbtiContext = '';
    if (mbtiResults.length > 0) {
      const mbti = mbtiResults[0];
      try {
        const scores = JSON.parse(mbti.scores);
        mbtiContext = `MBTI类型：${mbti.mbti_type}，各维度分值：E/I=${scores.EI}, S/N=${scores.SN}, T/F=${scores.TF}, J/P=${scores.JP}。`;
      } catch {
        mbtiContext = `MBTI类型：${mbti.mbti_type}。`;
      }
      if (mbti.ai_analysis) {
        mbtiContext += `\nMBTI分析：${mbti.ai_analysis}`;
      }
    }

    // Gather private info
    const privateInfo = await dbGet(
      'SELECT appearance, extra FROM user_private_info WHERE user_id = ?',
      [userId]
    );
    let privateContext = '';
    let gender = '';
    if (privateInfo) {
      const parts: string[] = [];
      try {
        const appearance = JSON.parse(privateInfo.appearance || '{}');
        const appDesc = Object.entries(appearance)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}: ${v}`)
          .join('，');
        if (appDesc) parts.push(`外貌信息：${appDesc}`);
      } catch { /* ignore */ }
      try {
        const extra = JSON.parse(privateInfo.extra || '{}');
        if (extra.gender) {
          gender = extra.gender;
          parts.push(`性别：${gender}`);
        }
        if (extra.location) parts.push(`所在地：${extra.location}`);
        if (extra.hobbies) parts.push(`兴趣爱好：${extra.hobbies}`);
        if (extra.friendIntention) parts.push(`交友意愿：${extra.friendIntention}`);
        if (Array.isArray(extra.items)) {
          for (const item of extra.items) {
            if (item.field && item.detail) {
              parts.push(`${item.field}：${item.detail}`);
              if (!gender && (item.field === '性别' || item.field === 'gender')) {
                gender = item.detail;
              }
            }
          }
        }
      } catch { /* ignore */ }
      if (parts.length > 0) {
        privateContext = parts.join('；');
      }
    }

    // Get astrology context
    const astrologyCtx = getAstrologyContextFromExtra(privateInfo?.extra);

    // Determine third-person pronoun based on gender
    let pronoun = 'TA';
    if (gender.includes('男') || gender.toLowerCase() === 'male') {
      pronoun = '他';
    } else if (gender.includes('女') || gender.toLowerCase() === 'female') {
      pronoun = '她';
    }

    const systemPrompt = `你是一个用户画像概览生成器。请根据用户的印象维度、MBTI结果、个人信息、命理信息（如有）等，生成通俗易读的个人概览。
要求：
1. 概览应融合所有可用信息，不要逐条罗列维度，而是用自然流畅的语言描述这个人。
2. 字数300字左右，充分展现这个人的特点。
3. 语气自然客观，基于事实描述，不要刻意夸张或美化。
4. 可以提及性格特点、兴趣爱好、处事风格等。
5. 必须基于客观事实描述，不允许无中生有或过度美化。例如：男性身高165cm就如实描述，不要说成"身材挺拔"或将其当作优势；体重、学历等信息也应如实呈现，不要刻意拔高。
6. 对于用户的不足或缺点，可以客观提及，不需要刻意隐藏，但也不要过度放大。
7. 不要使用"非凡"、"卓越"、"出色"、"顶尖"等夸张修饰词，用平实的语言描述即可。
8. 请将概览分成2-4个自然段落，每段聚焦一个方面（如性格特点、兴趣爱好、处事风格、交友意愿等），段落之间用换行符分隔。不要写成一整段。
9. 如果有星座和生辰八字等命理信息，可以略微参考其命理特征来丰富描述，但不要过度依赖或大段提及命理术语。

你需要生成两个版本，严格输出纯JSON格式：
{
  "self": "第一人称版本，用'我'开头，例如：我是一个热爱生活的人...",
  "other": "第三人称版本，用'${pronoun}'开头，例如：${pronoun}是一个热爱生活的人..."
}
不要包含markdown标记或其他文字，只输出JSON。`;

    const userMessage = `印象维度：${JSON.stringify(dimensions)}
${mbtiContext ? `\n${mbtiContext}` : ''}
${privateContext ? `\n个人信息：${privateContext}` : ''}
${astrologyCtx ? `\n命理信息：${astrologyCtx}` : ''}

请生成概览JSON。`;

    asyncLlmSubmit(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      async (content: string) => {
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            // Fallback: use the entire content as overview
            const overview = content.trim();
            await dbRun(
              `UPDATE user_impressions SET overview = ?, overview_self = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
              [overview, overview, userId]
            );
            logInfo('impression_overview_generated_fallback', { userId });
            return;
          }
          const result = JSON.parse(jsonMatch[0]);
          const overviewSelf = (result.self || '').trim();
          const overviewOther = (result.other || '').trim();
          await dbRun(
            `UPDATE user_impressions SET overview = ?, overview_self = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
            [overviewOther, overviewSelf, userId]
          );
          logInfo('impression_overview_generated', { userId, selfLength: overviewSelf.length, otherLength: overviewOther.length });
        } catch (parseErr) {
          logError('impression_overview_parse_error', parseErr as Error, { content });
        }
      },
      'impression_overview'
    );
  } catch (error) {
    logError('generate_impression_overview_error', error as Error, { userId });
  }
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

    // Get user's MBTI type
    const userMbti = await dbGet(
      'SELECT mbti_type FROM mbti_results WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [userId]
    );

    // Get all other users with impressions
    const otherUsers = await dbAll(
      `SELECT ui.user_id, ui.dimensions, upi.appearance, upi.extra,
              (SELECT mr.mbti_type FROM mbti_results mr WHERE mr.user_id = ui.user_id ORDER BY mr.created_at DESC LIMIT 1) as mbti_type
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
        { ...userPrivateInfo, mbtiType: userMbti?.mbti_type },
        other.user_id,
        JSON.parse(other.dimensions),
        { ...other, mbtiType: other.mbti_type }
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
  // Extract astrology context for both users
  const astrologyA = getAstrologyContextFromExtra(privateInfoA?.extra);
  const astrologyB = getAstrologyContextFromExtra(privateInfoB?.extra);

  // Determine which astrology/MBTI info is available for both users
  const hasBothAstrology = !!(astrologyA && astrologyB);
  const hasBothMbti = !!(privateInfoA?.mbtiType && privateInfoB?.mbtiType);

  const systemPrompt = `你是一个社交配对分析专家。请根据两个用户的印象数据、MBTI类型、星座信息和生辰八字命理信息，从以下维度对他们的配对进行评分和分析。

配对维度：${MATCHING_DIMENSIONS.join('、')}

分析时请综合考虑：
1. MBTI性格类型的兼容性（如ENFP与INTJ的互补性等）
2. 星座学上的配对关系（如水象与土象星座的稳定组合等）
3. 生辰八字命理学（五行互补、天干地支相合相冲等）
4. 以上三者仅作为参考因素，最终评分仍以印象数据和实际信息为主

请为每个维度打分（0-10），并计算总分（各维度分数之和）。
同时，请为双方各生成一段配对理由（reason_a_to_b 是对A说明B为什么适合A，reason_b_to_a 是对B说明A为什么适合B），每段不超过80字，要基于客观事实，不要夸张或美化。
生成配对理由时的【强制要求】：
${hasBothMbti ? '- 双方均有MBTI信息，配对理由中【必须】明确提及双方的MBTI类型（如"你的ENFP与对方INTJ形成互补"），并说明MBTI兼容性对配对的影响。' : '- 如有MBTI信息，应结合双方的MBTI类型兼容性来说明。'}
${hasBothAstrology ? '- 双方均有生辰和星座信息，配对理由中【必须】明确提及双方的星座（如"你的天蝎座与对方巨蟹座同属水象星座，天然亲近"），并融合五行或八字命理分析（如"五行互补，木火相生"）。这些内容不可省略。' : '- 如有星座或命理信息，应结合星座配对关系和生辰八字命理来说明。'}
- 配对理由应将MBTI、星座命理与印象数据中的契合点融合描述，而非只说笼统的性格评价。
- 不要无中生有或刻意拔高对方的条件。对于对方的不足之处，不需要刻意隐藏，可以不提及但不要美化。
严格输出纯JSON格式，示例：
{"scores":{"吸引触发":5,"价值共鸣":7},"total":80,"summary":"简要配对评语","reason_a_to_b":"你的ENFP与对方INTJ互补性强，双鱼座与天蝎座水象共鸣深，五行木火相生，价值观契合","reason_b_to_a":"对方ENFP的热情激发你的创造力，巨蟹座与双鱼座情感联结紧密，八字天干相合，兴趣有交集"}`;

  const userMessage = `用户A的印象：${JSON.stringify(dimensionsA)}
${privateInfoA?.appearance ? `用户A的外貌描述：${privateInfoA.appearance}` : ''}
${privateInfoA?.mbtiType ? `用户A的MBTI类型：${privateInfoA.mbtiType}` : ''}
${astrologyA ? `用户A的命理信息：${astrologyA}` : ''}

用户B的印象：${JSON.stringify(dimensionsB)}
${privateInfoB?.appearance ? `用户B的外貌描述：${privateInfoB.appearance}` : ''}
${privateInfoB?.mbtiType ? `用户B的MBTI类型：${privateInfoB.mbtiType}` : ''}
${astrologyB ? `用户B的命理信息：${astrologyB}` : ''}

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
