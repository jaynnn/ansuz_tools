/**
 * Migration script for existing MBTI users.
 * Run manually: npx ts-node scripts/migrateExistingMbtiUsers.ts
 *
 * This script:
 * 1. Finds all users who have MBTI results but no impression data
 * 2. Generates impressions for each using their latest MBTI result
 * 3. Triggers matching for each user (respecting cooldown)
 */

import dotenv from 'dotenv';
import path from 'path';

// Load env from backend directory
dotenv.config({ path: path.join(__dirname, '../.env') });

import { initDatabase, dbAll, dbGet } from '../src/utils/database';
import { triggerImpressionUpdate, triggerUserMatching } from '../src/utils/impressionService';
import { logInfo, logError } from '../src/utils/logger';

const DELAY_BETWEEN_USERS_MS = 5000; // 5 second delay between users to avoid LLM rate limits

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const migrate = async () => {
  try {
    console.log('Initializing database...');
    await initDatabase();

    // Find all users with MBTI results (always regenerate impressions when running manually)
    const users = await dbAll(
      `SELECT DISTINCT mr.user_id, mr.mbti_type, mr.scores
       FROM mbti_results mr
       ORDER BY mr.created_at DESC`
    );

    // Deduplicate by user_id (keep latest)
    const uniqueUsers = new Map<number, any>();
    for (const user of users) {
      if (!uniqueUsers.has(user.user_id)) {
        uniqueUsers.set(user.user_id, user);
      }
    }

    const userList = Array.from(uniqueUsers.values());
    console.log(`Found ${userList.length} users to process.`);

    if (userList.length === 0) {
      console.log('No users with MBTI results found. Exiting.');
      process.exit(0);
    }

    for (let i = 0; i < userList.length; i++) {
      const user = userList[i];
      const scores = JSON.parse(user.scores);

      console.log(`[${i + 1}/${userList.length}] Processing user ${user.user_id} (${user.mbti_type})...`);

      // Trigger impression update
      await triggerImpressionUpdate(
        user.user_id,
        'MBTI测试完成（手动重新生成）',
        `用户完成了MBTI测试，结果为${user.mbti_type}。各维度分值：E/I=${scores.EI}, S/N=${scores.SN}, T/F=${scores.TF}, J/P=${scores.JP}。`
      );

      // Wait for LLM to process before triggering matching
      console.log(`  Waiting ${DELAY_BETWEEN_USERS_MS / 1000}s for impression generation...`);
      await sleep(DELAY_BETWEEN_USERS_MS);

      // Trigger matching
      await triggerUserMatching(user.user_id);

      console.log(`  Matching triggered for user ${user.user_id}.`);

      // Delay before next user
      if (i < userList.length - 1) {
        console.log(`  Waiting before next user...`);
        await sleep(DELAY_BETWEEN_USERS_MS);
      }
    }

    console.log('Processing complete! Note: LLM processing is async and may still be running in the background.');
    console.log('Wait a few minutes for all LLM requests to complete before verifying data.');

    // Keep process alive for async operations to complete
    const FINAL_WAIT_MS = 30000;
    console.log(`Waiting ${FINAL_WAIT_MS / 1000} seconds for async operations to finish...`);
    await sleep(FINAL_WAIT_MS);
    console.log('Done.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    logError('migration_error', error as Error);
    process.exit(1);
  }
};

migrate();
