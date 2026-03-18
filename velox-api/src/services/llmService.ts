// src/services/llmService.ts
//
// Multi-provider LLM service supporting:
// - SGLang (self-hosted on Modal) - primary
// - Kimi (Moonshot AI) - OpenAI-compatible API
// - OpenAI - Native SDK
//
// Set LLM_PROVIDER env var to switch providers.
// All providers use OpenAI-compatible API format.

import { logger } from "../utils/logger";
import { tools } from "../tools/definitions";
import { toolRegistry } from "../tools/registry";

const FILLER_PHRASES = [
  "One moment, let me check that for you.",
  "Just a second, looking that up.",
  "Let me see what I can find.",
  "Checking on that now.",
];

// Provider configuration
type LLMProvider = "sglang" | "kimi" | "openai";

interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const PROVIDER_CONFIGS: Record<LLMProvider, () => ProviderConfig> = {
  sglang: () => ({
    apiKey: process.env.SGLANG_API_KEY || "",
    baseUrl: process.env.SGLANG_BASE_URL || "http://localhost:8000/v1",
    model: process.env.SGLANG_MODEL_T1 || "nvidia/Nemotron-3-Nano-4B-Instruct",
  }),
  kimi: () => ({
    apiKey: process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || "",
    baseUrl: process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1",
    model: process.env.KIMI_MODEL || "moonshot-v1-8k",
  }),
  openai: () => ({
    apiKey: process.env.OPENAI_API_KEY || "",
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  }),
};

export class LLMService {
  private provider: LLMProvider;
  private config: ProviderConfig;
  private client: any = null;
  private systemPrompt: string;

  constructor() {
    // Determine provider from env or auto-detect based on available keys
    this.provider = this.detectProvider();
    this.config = PROVIDER_CONFIGS[this.provider]();

    this.systemPrompt = `
      You are a helpful assistant named Velox.
      Tone: Professional but friendly.
      Constraint: Keep answers concise (under 2 sentences).
      If you need to use a tool, do it silently.
    `;

    logger.info({ provider: this.provider, model: this.config.model }, "LLM Service initialized");
  }

  private detectProvider(): LLMProvider {
    const explicit = process.env.LLM_PROVIDER?.toLowerCase() as LLMProvider;
    if (explicit && PROVIDER_CONFIGS[explicit]) {
      return explicit;
    }

    // Auto-detect based on available API keys / URLs
    if (process.env.SGLANG_BASE_URL) {
      return "sglang";
    }
    if (process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY) {
      return "kimi";
    }
    if (process.env.OPENAI_API_KEY) {
      return "openai";
    }

    // Default to kimi for backwards compatibility
    return "kimi";
  }

  private async getClient(): Promise<any> {
    if (this.client) return this.client;

    // Dynamic import to avoid bundling issues
    const OpenAI = (await import("openai")).default;

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
    });

    console.log("--------------------------------------------------");
    console.log(`LLM Service Initialized (${this.provider.toUpperCase()})`);
    console.log(`Model: ${this.config.model}`);
    console.log(`Base URL: ${this.config.baseUrl}`);
    console.log("--------------------------------------------------");

    return this.client;
  }

  async generateResponse(
    input: string,
    onSentence: (text: string) => void,
    context: string = ""
  ) {
    // All providers use OpenAI-compatible API
    return this.generateWithOpenAICompatible(input, onSentence, context);
  }

  // OpenAI-compatible API (SGLang, Kimi, OpenAI)
  private async generateWithOpenAICompatible(
    input: string,
    onSentence: (text: string) => void,
    context: string = ""
  ) {
    try {
      const client = await this.getClient();

      let systemContent = this.systemPrompt;
      if (context) {
        systemContent += `\n\n=== KNOWLEDGE BASE ===\n${context}\n======================`;
      }

      // Convert tools to OpenAI format
      const openaiTools = tools.map(tool => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));

      const messages: any[] = [
        { role: "system", content: systemContent },
        { role: "user", content: input },
      ];

      let response = await client.chat.completions.create({
        model: this.config.model,
        messages,
        tools: openaiTools.length > 0 ? openaiTools : undefined,
        tool_choice: openaiTools.length > 0 ? "auto" : undefined,
      });

      let assistantMessage = response.choices[0].message;

      // Tool execution loop
      while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        const toolCall = assistantMessage.tool_calls[0];
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        logger.info(`AI wants to execute: ${functionName}(${JSON.stringify(functionArgs)})`);

        // @ts-ignore
        const functionToCall = toolRegistry[functionName];

        if (functionToCall) {
          // Play filler phrase
          const randomFiller = FILLER_PHRASES[Math.floor(Math.random() * FILLER_PHRASES.length)];
          logger.info(`AI (Filler): ${randomFiller}`);
          onSentence(randomFiller);

          // Execute tool
          const result = await functionToCall(functionArgs);
          logger.info(`Tool Result: ${JSON.stringify(result)}`);

          // Add assistant message and tool result to conversation
          messages.push(assistantMessage);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });

          // Get next response
          response = await client.chat.completions.create({
            model: this.config.model,
            messages,
            tools: openaiTools.length > 0 ? openaiTools : undefined,
            tool_choice: openaiTools.length > 0 ? "auto" : undefined,
          });

          assistantMessage = response.choices[0].message;
        } else {
          logger.warn(`Tool '${functionName}' not found.`);
          break;
        }
      }

      // Extract final text response
      const text = assistantMessage.content;
      if (text) {
        this.processBuffer(text, onSentence);
      }

    } catch (error: any) {
      logger.error({ error }, "Error generating LLM response");
      console.error(`${this.provider.toUpperCase()} ERROR:`, error.message);
      if (error.stack) console.error(error.stack);
      onSentence("I'm having trouble connecting right now.");
    }
  }

  private processBuffer(text: string, onSentence: (text: string) => void) {
    if (!text) return;
    const sentences = text.match(/[^.?!]+[.?!]+|[^.?!]+$/g) || [text];
    sentences.forEach((sentence) => {
      const trimmed = sentence.trim();
      if (trimmed) {
        logger.info(`AI (Speaking): ${trimmed}`);
        onSentence(trimmed);
      }
    });
  }

  // Get current provider info (for debugging/monitoring)
  getProviderInfo() {
    return {
      provider: this.provider,
      model: this.config.model,
      baseUrl: this.config.baseUrl,
    };
  }
}
