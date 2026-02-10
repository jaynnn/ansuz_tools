import { chatCompletion, LLMMessage } from './llmService';
import { logInfo, logError } from './logger';

/**
 * Async (fire-and-forget) LLM submission.
 * Calls chatCompletion in the background and invokes the callback with the result.
 * Does NOT block the caller.
 */
export const asyncLlmSubmit = (
  messages: LLMMessage[],
  onSuccess: (content: string) => void | Promise<void>,
  context?: string
): void => {
  const tag = context || 'async_llm';
  logInfo(`${tag}_submitted`, { messageCount: messages.length });

  chatCompletion(messages)
    .then(async (result) => {
      logInfo(`${tag}_success`, { model: result.model, usage: result.usage });
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
