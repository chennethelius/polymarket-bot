import Anthropic from '@anthropic-ai/sdk';
import { env } from './config';

const createAnthropicClient = () => {
  if (!env.ANTHROPIC_API_KEY) {
    console.warn('⚠️ ANTHROPIC_API_KEY not configured. AI features will be disabled.');
    return null;
  }

  return new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
  });
};

export const anthropic = createAnthropicClient();

// Helper to check if AI is available
export const isAIEnabled = () => anthropic !== null;
