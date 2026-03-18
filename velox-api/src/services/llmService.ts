// src/services/llmService.ts
//
// Multi-provider LLM service supporting:
// - Kimi (Moonshot AI) - OpenAI-compatible API
// - Gemini (Google) - Native SDK
// - OpenAI - Native SDK
//
// Set LLM_PROVIDER env var to switch providers.

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
type LLMProvider = "kimi" | "gemini" | "openai";

interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
}

const PROVIDER_CONFIGS: Record<LLMProvider, () => ProviderConfig> = {
  kimi: () => ({
    apiKey: process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || "",
    baseUrl: process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1",
    model: process.env.KIMI_MODEL || "moonshot-v1-8k",
  }),
  gemini: () => ({
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "",
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  }),
  openai: () => ({
    apiKey: process.env.OPENAI_API_KEY || "",
    baseUrl: process.env.OPENAI_BASE_URL,
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

    // Auto-detect based on available API keys
    if (process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY) {
      return "kimi";
    }
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
      return "gemini";
    }
    if (process.env.OPENAI_API_KEY) {
      return "openai";
    }

    // Default to gemini for backwards compatibility
    return "gemini";
  }

  private async getOpenAICompatibleClient(): Promise<any> {
    if (this.client) return this.client;

    // Dynamic import to avoid bundling issues
    const OpenAI = (await import("openai")).default;

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
    });

    console.log("--------------------------------------------------");
    console.log(`🛠️  LLM Service Initialized (${this.provider.toUpperCase()})`);
    console.log(`🤖  Model: ${this.config.model}`);
    console.log(`🔗  Base URL: ${this.config.baseUrl || "default"}`);
    console.log("--------------------------------------------------");

    return this.client;
  }

  private async getGeminiClient(): Promise<any> {
    if (this.client) return this.client;

    const { GoogleGenAI } = await import("@google/genai");
    this.client = new GoogleGenAI({ apiKey: this.config.apiKey });

    console.log("--------------------------------------------------");
    console.log("🛠️  LLM Service Initialized (GEMINI)");
    console.log(`🤖  Model: ${this.config.model}`);
    console.log("--------------------------------------------------");

    return this.client;
  }

  async generateResponse(
    input: string,
    onSentence: (text: string) => void,
    context: string = ""
  ) {
    if (this.provider === "gemini") {
      return this.generateWithGemini(input, onSentence, context);
    } else {
      return this.generateWithOpenAICompatible(input, onSentence, context);
    }
  }

  // OpenAI-compatible API (Kimi, OpenAI, etc.)
  private async generateWithOpenAICompatible(
    input: string,
    onSentence: (text: string) => void,
    context: string = ""
  ) {
    try {
      const client = await this.getOpenAICompatibleClient();

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

        logger.info(`🤖 AI wants to execute: ${functionName}(${JSON.stringify(functionArgs)})`);

        // @ts-ignore
        const functionToCall = toolRegistry[functionName];

        if (functionToCall) {
          // Play filler phrase
          const randomFiller = FILLER_PHRASES[Math.floor(Math.random() * FILLER_PHRASES.length)];
          logger.info(`🤖 AI (Filler): ${randomFiller}`);
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
          logger.warn(`❌ Tool '${functionName}' not found.`);
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

  // Gemini-specific implementation (original code)
  private async generateWithGemini(
    input: string,
    onSentence: (text: string) => void,
    context: string = ""
  ) {
    try {
      const ai = await this.getGeminiClient();

      let instructions = this.systemPrompt;
      if (context) {
        instructions += `\n\n=== KNOWLEDGE BASE ===\n${context}\n======================`;
      }

      // Convert tools to correct format for @google/genai
      const formattedTools = tools.map(tool => ({
        type: 'function' as const,
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }));

      let response = await ai.models.generateContent({
        model: this.config.model,
        contents: input,
        config: {
          systemInstruction: instructions,
          tools: formattedTools,
        },
      });

      // Tool Execution Loop
      while (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];
        const { name, args } = call;

        logger.info(`🤖 AI wants to execute: ${name}(${JSON.stringify(args)})`);

        // @ts-ignore
        const functionToCall = toolRegistry[name];

        if (functionToCall) {
          // Play Filler Phrase
          const randomFiller = FILLER_PHRASES[Math.floor(Math.random() * FILLER_PHRASES.length)];
          logger.info(`🤖 AI (Filler): ${randomFiller}`);
          onSentence(randomFiller);

          // Execute Tool
          const apiResult = await functionToCall(args);
          logger.info(`Tool Result: ${JSON.stringify(apiResult)}`);

          // Send function response back
          response = await ai.models.generateContent({
            model: this.config.model,
            contents: [
              {
                role: 'user',
                parts: [{ text: input }]
              },
              {
                role: 'model',
                parts: response.functionCalls.map((fc: any) => ({
                  functionCall: fc
                }))
              },
              {
                role: 'function',
                parts: [{
                  functionResponse: {
                    name: name,
                    response: apiResult,
                  }
                }]
              }
            ],
            config: {
              systemInstruction: instructions,
              tools: formattedTools,
            },
          });

        } else {
          logger.warn(`❌ Tool '${name}' not found.`);
          break;
        }
      }

      // Extract final text response
      const text = response.text;
      if (text) {
        this.processBuffer(text, onSentence);
      }

    } catch (error: any) {
      logger.error({ error }, "Error generating LLM response");
      console.error("GEMINI ERROR MESSAGE:", error.message);
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
        logger.info(`🤖 AI (Speaking): ${trimmed}`);
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
