import OpenAI from 'openai';

const getOpenAIClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
};

export const getOpenAIModel = () => process.env.OPENAI_MODEL || 'gpt-5.6-luna';

export const createTextResponse = async ({ input, instructions, textFormat } = {}) => {
  const client = getOpenAIClient();

  try {
    if (client.responses?.create) {
      const response = await client.responses.create({
        model: getOpenAIModel(),
        ...(instructions ? { instructions } : {}),
        input,
        ...(textFormat ? { text: { format: textFormat } } : {}),
      });
      return response;
    }
  } catch (error) {
    console.warn('OpenAI responses.create fallback to chat completions:', error.message);
  }

  const messages = [];
  if (instructions) {
    messages.push({ role: 'system', content: instructions });
  }
  messages.push({ role: 'user', content: typeof input === 'string' ? input : JSON.stringify(input) });

  const fallbackModel = process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  return client.chat.completions.create({
    model: fallbackModel,
    messages,
  });
};

