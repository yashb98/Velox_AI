// src/lib/demoAgent.ts
// Shared constants and helpers for the dummy/demo agent used in the tutorial.
//
// The demo agent is stored in localStorage under DEMO_AGENT_KEY so it
// persists across page refreshes. It has a fixed id ("demo") so the
// Playground can route to it at /agents/demo/playground and the
// FlowCanvas can attach a demo flow to it.

export const DEMO_AGENT_ID = 'demo'
export const DEMO_AGENT_KEY = 'velox_demo_agent'
export const DEMO_FLOW_KEY = 'velox_demo_flow'
export const DEMO_CHAT_KEY = 'velox_demo_chat'

export interface DemoAgent {
  id: string
  name: string
  voice_id: string
  phone_number: string | null
  system_prompt: string
  is_active: boolean
  _isDemo: true
  createdAt: string
  updatedAt: string
}

export const DEFAULT_DEMO_AGENT: DemoAgent = {
  id: DEMO_AGENT_ID,
  name: 'Demo Support Agent',
  voice_id: 'aura-asteria-en',
  phone_number: null,
  system_prompt:
    'You are a friendly customer support agent for Velox AI. Help users understand how to create agents, build flows, and test conversations. Keep answers concise and helpful.',
  is_active: true,
  _isDemo: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

// ── Persistence helpers ──────────────────────────────────────────────────────

export function loadDemoAgent(): DemoAgent | null {
  try {
    const raw = localStorage.getItem(DEMO_AGENT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveDemoAgent(agent: DemoAgent): void {
  try {
    localStorage.setItem(DEMO_AGENT_KEY, JSON.stringify({ ...agent, updatedAt: new Date().toISOString() }))
  } catch { /* noop */ }
}

export function deleteDemoAgent(): void {
  try {
    localStorage.removeItem(DEMO_AGENT_KEY)
    localStorage.removeItem(DEMO_FLOW_KEY)
    localStorage.removeItem(DEMO_CHAT_KEY)
  } catch { /* noop */ }
}

export function isDemoAgentId(id: string | undefined): boolean {
  return id === DEMO_AGENT_ID
}

// ── Demo chat simulation ──────────────────────────────────────────────────────
// When the real API isn't available the playground falls back to this
// simple local simulation so the tutorial still works.

const DEMO_RESPONSES: Record<string, string> = {
  default:
    'Thanks for reaching out! I\'m your Velox AI demo agent. This is a simulated response — in production I would use your real LLM configuration to answer.',
  hello:
    'Hi there! 👋 I\'m your Velox AI demo support agent. How can I help you today?',
  help:
    'I\'m here to help! You can ask me anything about the platform — creating agents, building flows, or testing conversations.',
  flow:
    'Great question about flows! The Flow Builder lets you design conversation trees visually. Drag nodes from the left panel and connect them to define how calls progress.',
  agent:
    'Agents are the core of Velox AI. Each agent has a name, voice, system prompt, and optional phone number. Once configured, agents can answer real calls 24/7.',
  playground:
    'The Playground is exactly what you\'re using now — a safe sandbox to test how your agent responds before going live. No real calls are made here.',
  policy:
    'Company policies help your agents stay on-brand and compliant. You can define tone, escalation rules, and forbidden topics in the Company Policy page.',
}

export function simulateDemoResponse(userMessage: string): string {
  const lower = userMessage.toLowerCase()
  for (const [key, response] of Object.entries(DEMO_RESPONSES)) {
    if (key !== 'default' && lower.includes(key)) return response
  }
  return DEMO_RESPONSES.default
}
