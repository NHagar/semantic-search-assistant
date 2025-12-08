import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { config } from '../config/index.js';

class LLMClient {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      baseURL: config.LM_STUDIO_URL,
      apiKey: config.LM_STUDIO_API_KEY,
    });
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    model?: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      tools?: ChatCompletionTool[];
      toolChoice?: 'auto' | 'none' | 'required';
    }
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    return this.client.chat.completions.create({
      model: model ?? config.DEFAULT_MODEL,
      messages,
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      tools: options?.tools,
      tool_choice: options?.toolChoice,
    });
  }

  async *chatStream(
    messages: ChatCompletionMessageParam[],
    model?: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): AsyncGenerator<string, void, unknown> {
    const stream = await this.client.chat.completions.create({
      model: model ?? config.DEFAULT_MODEL,
      messages,
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const models = await this.client.models.list();
      return models.data.map(m => m.id);
    } catch (error) {
      console.error('Failed to fetch models:', error);
      return [];
    }
  }

  getClient(): OpenAI {
    return this.client;
  }
}

export const llmClient = new LLMClient();
