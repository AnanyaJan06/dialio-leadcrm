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

  const response = await client.responses.create({
    model: getOpenAIModel(),
    ...(instructions ? { instructions } : {}),
    input,
    ...(textFormat ? { text: { format: textFormat } } : {}),
  });

  return response;
};
