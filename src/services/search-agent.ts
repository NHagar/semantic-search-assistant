import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { llmClient } from './llm-client.js';
import { vectorStore } from './vector-store.js';
import { embeddingService } from './embeddings.js';
import { prompts } from './prompts.js';

const searchTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'search_documents',
    description: 'Search through the document collection using semantic search. Returns relevant document chunks with citation keys.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to find relevant documents.',
        },
        max_results: {
          type: 'integer',
          description: 'Maximum number of results to return (default: 5, max: 20)',
          minimum: 1,
          maximum: 20,
          default: 5,
        },
      },
      required: ['query'],
    },
  },
};

export interface SearchAgentResult {
  report: string;
  searches: Array<{
    query: string;
    results: string[];
  }>;
  iterations: number;
}

export class SearchAgent {
  private projectId: string;
  private maxIterations: number;

  constructor(projectId: string, maxIterations: number = 15) {
    this.projectId = projectId;
    this.maxIterations = maxIterations;
  }

  async executeSearchPlan(
    searchPlan: string,
    model?: string
  ): Promise<SearchAgentResult> {
    const systemPrompt = prompts.search + '\n\n' + searchPlan;
    const searches: Array<{ query: string; results: string[] }> = [];

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Begin executing the search plan. Use the search tool strategically and provide a comprehensive report when complete.' },
    ];

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      const response = await llmClient.chat(messages, model, {
        tools: [searchTool],
        toolChoice: 'auto',
      });

      const message = response.choices[0].message;

      // Add assistant message to history
      messages.push({
        role: 'assistant',
        content: message.content,
        tool_calls: message.tool_calls,
      } as ChatCompletionMessageParam);

      // Check if there are tool calls
      if (!message.tool_calls || message.tool_calls.length === 0) {
        // No more tool calls - return the report
        return {
          report: message.content || '',
          searches,
          iterations: iteration + 1,
        };
      }

      // Execute tool calls
      for (const toolCall of message.tool_calls) {
        if (toolCall.function.name === 'search_documents') {
          const args = JSON.parse(toolCall.function.arguments);
          const query = args.query;
          const maxResults = args.max_results || 5;

          // Execute search
          const results = await vectorStore.search(this.projectId, query, maxResults);

          // Format results for the LLM
          const formattedResults = results.map(r => ({
            citation_key: r.citation_key,
            filename: r.filename,
            content: r.content,
            similarity: r.similarity.toFixed(3),
          }));

          // Track the search
          searches.push({
            query,
            results: results.map(r => r.citation_key),
          });

          // Add tool result to messages
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(formattedResults, null, 2),
          });
        }
      }
    }

    // Max iterations reached - request final report
    messages.push({
      role: 'user',
      content: 'Please provide your final report now based on the searches conducted.',
    });

    const finalResponse = await llmClient.chat(messages, model);
    const finalReport = finalResponse.choices[0].message.content || '';

    return {
      report: finalReport,
      searches,
      iterations: this.maxIterations,
    };
  }
}
