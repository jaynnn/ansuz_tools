/**
 * Export script for user account information.
 * Run manually: npx ts-node scripts/exportUsers.ts
 *
 * This script exports all user accounts with their related information
 * including nickname, avatar, MBTI type, impressions, private info, etc.
 * Output is printed to stdout as JSON (can be redirected to a file).
 */

import dotenv from 'dotenv';
import path from 'path';

// Load env from backend directory
dotenv.config({ path: path.join(__dirname, '../.env') });

import { initDatabase, dbAll } from '../src/utils/database';

const exportUsers = async () => {
  try {
    await initDatabase();

    // Get all users (excluding passwords)
    const users = await dbAll(
      `SELECT id, username, nickname, avatar, created_at FROM users ORDER BY id`
    );

    // Get latest MBTI results per user
    const mbtiResults = await dbAll(
      `SELECT user_id, mbti_type, scores, created_at
       FROM mbti_results
       WHERE id IN (SELECT MAX(id) FROM mbti_results GROUP BY user_id)`
    );
    const mbtiMap = new Map(mbtiResults.map((r: any) => [r.user_id, r]));

    // Get impressions
    const impressions = await dbAll(
      `SELECT user_id, dimensions, overview, overview_self, updated_at FROM user_impressions`
    );
    const impressionMap = new Map(impressions.map((r: any) => [r.user_id, r]));

    // Get private info
    const privateInfos = await dbAll(
      `SELECT user_id, appearance, contact, extra, updated_at FROM user_private_info`
    );
    const privateInfoMap = new Map(privateInfos.map((r: any) => [r.user_id, r]));

    // Get tool counts per user
    const toolCounts = await dbAll(
      `SELECT user_id, COUNT(*) as count FROM tools GROUP BY user_id`
    );
    const toolCountMap = new Map(toolCounts.map((r: any) => [r.user_id, r.count]));

    // Build export data
    const exportData = users.map((user: any) => {
      const mbti = mbtiMap.get(user.id);
      const impression = impressionMap.get(user.id);
      const privateInfo = privateInfoMap.get(user.id);

      return {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar || 'seal',
        created_at: user.created_at,
        toolCount: toolCountMap.get(user.id) || 0,
        mbti: mbti ? {
          type: mbti.mbti_type,
          scores: JSON.parse(mbti.scores),
          tested_at: mbti.created_at,
        } : null,
        impression: impression ? {
          overview: impression.overview,
          overview_self: impression.overview_self,
          updated_at: impression.updated_at,
        } : null,
        privateInfo: privateInfo ? {
          appearance: privateInfo.appearance,
          contact: privateInfo.contact,
          extra: privateInfo.extra,
          updated_at: privateInfo.updated_at,
        } : null,
      };
    });

    console.log(JSON.stringify(exportData, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Export failed:', error);
    process.exit(1);
  }
};

exportUsers();
