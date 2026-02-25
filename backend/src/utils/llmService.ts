import https from 'https';
import http from 'http';
import { logInfo, logError } from './logger';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const DEFAULT_TIMEOUT_MS = 120000; // 120 seconds

const getDefaultConfig = (): Required<LLMConfig> => ({
  apiKey: process.env.LLM_API_KEY || '',
  baseUrl: process.env.LLM_API_BASE_URL || 'https://api.deepseek.com',
  model: process.env.LLM_MODEL || 'deepseek-chat',
  temperature: 0.7,
});

export const chatCompletion = async (
  messages: LLMMessage[],
  config?: LLMConfig
): Promise<LLMResponse> => {
  const finalConfig = { ...getDefaultConfig(), ...config };

  if (!finalConfig.apiKey) {
    throw new Error('LLM API key is not configured. Set LLM_API_KEY in environment variables.');
  }

  const url = new URL('/v1/chat/completions', finalConfig.baseUrl);
  const isHttps = url.protocol === 'https:';
  const requestModule = isHttps ? https : http;

  const requestBody = JSON.stringify({
    model: finalConfig.model,
    messages,
    temperature: finalConfig.temperature,
  });

  logInfo('llm_request', {
    model: finalConfig.model,
    baseUrl: finalConfig.baseUrl,
    messageCount: messages.length,
  });

  return new Promise((resolve, reject) => {
    const req = requestModule.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${finalConfig.apiKey}`,
          'Content-Length': Buffer.byteLength(requestBody),
        },
        timeout: DEFAULT_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => { chunks.push(chunk); });
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf-8');
          try {
            if (res.statusCode && res.statusCode >= 400) {
              logError('llm_request_failed', new Error(`LLM API returned status ${res.statusCode}`), { response: data });
              reject(new Error(`LLM API error (${res.statusCode}): ${data}`));
              return;
            }
            const parsed = JSON.parse(data);
            const result: LLMResponse = {
              content: parsed.choices?.[0]?.message?.content || '',
              model: parsed.model || finalConfig.model,
              usage: parsed.usage,
            };
            logInfo('llm_request_success', {
              model: result.model,
              usage: result.usage,
            });
            resolve(result);
          } catch (err) {
            logError('llm_response_parse_error', err as Error, { data });
            reject(new Error('Failed to parse LLM response'));
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('LLM API request timed out'));
    });

    req.on('error', (err) => {
      logError('llm_request_error', err);
      reject(err);
    });

    req.write(requestBody);
    req.end();
  });
};

export const getLLMConfig = (): { model: string; baseUrl: string; configured: boolean } => {
  const config = getDefaultConfig();
  return {
    model: config.model,
    baseUrl: config.baseUrl,
    configured: !!config.apiKey,
  };
};
