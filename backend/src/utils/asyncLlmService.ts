import { chatCompletion, LLMMessage } from './llmService';
import { logInfo, logError } from './logger';
import { dbRun } from './database';

/**
 * Record token usage for a user.
 */
const recordTokenUsage = async (
  userId: number,
  context: string,
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined,
  model: string
): Promise<void> => {
  if (!usage) return;
  try {
    await dbRun(
      `INSERT INTO token_usage (user_id, context, prompt_tokens, completion_tokens, total_tokens, model)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, context, usage.prompt_tokens, usage.completion_tokens, usage.total_tokens, model]
    );
  } catch (err) {
    logError('record_token_usage_error', err as Error, { userId, context });
  }
};

/**
 * Async (fire-and-forget) LLM submission.
 * Calls chatCompletion in the background and invokes the callback with the result.
 * Does NOT block the caller.
 */
export const asyncLlmSubmit = (
  messages: LLMMessage[],
  onSuccess: (content: string) => void | Promise<void>,
  context?: string,
  userId?: number
): void => {
  const tag = context || 'async_llm';
  logInfo(`${tag}_submitted`, { messageCount: messages.length });

  chatCompletion(messages)
    .then(async (result) => {
      logInfo(`${tag}_success`, { model: result.model, usage: result.usage });
      // Record token usage if userId is provided
      if (userId) {
        await recordTokenUsage(userId, tag, result.usage, result.model);
      }
      try {
        await onSuccess(result.content);
      } catch (cbErr) {
        logError(`${tag}_callback_error`, cbErr as Error);
      }
    })
    .catch((err) => {
      logError(`${tag}_error`, err as Error);
    });
};

export { recordTokenUsage };
