import OpenAI from 'openai';

const OPENAI_TIMEOUT_MS = Math.max(3000, Number(process.env.OPENAI_TIMEOUT_MS) || 12000);
const FALLBACK_TIMEOUT_MS = Math.max(3000, Number(process.env.OPENAI_FALLBACK_TIMEOUT_MS) || 8000);

let cachedClient = null;
let cachedApiKey = null;

const getOpenAIClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  if (!cachedClient || cachedApiKey !== process.env.OPENAI_API_KEY) {
    cachedApiKey = process.env.OPENAI_API_KEY;
    cachedClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: OPENAI_TIMEOUT_MS,
      maxRetries: 1,
    });
  }

  return cachedClient;
};

export const getOpenAIModel = () => process.env.OPENAI_MODEL || 'gpt-5.6-luna';

export const createTextResponse = async ({ input, instructions, textFormat } = {}) => {
  const client = getOpenAIClient();

  // 1. Try Responses API with timeout
  try {
    if (client.responses?.create) {
      const response = await client.responses.create(
        {
          model: getOpenAIModel(),
          ...(instructions ? { instructions } : {}),
          input,
          ...(textFormat ? { text: { format: textFormat } } : {}),
        },
        {
          signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
        }
      );
      return response;
    }
  } catch (error) {
    console.warn('OpenAI responses.create error/fallback to chat completions:', error.message);
  }

  // 2. Fallback to Chat Completions with timeout
  const messages = [];
  if (instructions) {
    messages.push({ role: 'system', content: instructions });
  }
  messages.push({ role: 'user', content: typeof input === 'string' ? input : JSON.stringify(input) });

  const fallbackModel = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';

  try {
    const chatResponse = await client.chat.completions.create(
      {
        model: fallbackModel,
        messages,
      },
      {
        signal: AbortSignal.timeout(FALLBACK_TIMEOUT_MS),
      }
    );
    return chatResponse;
  } catch (fallbackError) {
    console.error('OpenAI chat completions fallback also failed:', fallbackError.message);
    throw fallbackError;
  }
};


