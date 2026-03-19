// src/pages/DocsPage.tsx — Full Velox AI in-app documentation
// Rebuilt with warm theme matching the Claude.ai-inspired design system

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Bot,
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Zap,
  Phone,
  BarChart3,
  FileText,
  CreditCard,
  Shield,
  Code2,
  PlayCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  Layers,
  Brain,
  Settings,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Section {
  id: string
  label: string
  icon: React.ElementType
  subsections?: { id: string; label: string }[]
}

// ── Sidebar nav ────────────────────────────────────────────────────────────────

const sections: Section[] = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'quickstart', label: 'Quick Start', icon: Zap, subsections: [
    { id: 'qs-setup', label: 'Local setup' },
    { id: 'qs-first-agent', label: 'Create your first agent' },
    { id: 'qs-test', label: 'Test in Playground' },
    { id: 'qs-phone', label: 'Connect a phone number' },
  ]},
  { id: 'agents', label: 'Agents', icon: Bot, subsections: [
    { id: 'agents-wizard', label: 'Onboarding wizard' },
    { id: 'agents-voice', label: 'Voice options' },
    { id: 'agents-prompt', label: 'System prompts' },
    { id: 'agents-tools', label: 'Tool integrations' },
  ]},
  { id: 'documents', label: 'Company Documents', icon: FileText, subsections: [
    { id: 'docs-what', label: 'What is RAG?' },
    { id: 'docs-upload', label: 'Uploading documents' },
    { id: 'docs-search', label: 'Hybrid search' },
  ]},
  { id: 'playground', label: 'Playground', icon: PlayCircle, subsections: [
    { id: 'pg-features', label: 'Features' },
    { id: 'pg-inspector', label: 'Inspector panel' },
    { id: 'pg-templates', label: 'Test templates' },
  ]},
  { id: 'voice', label: 'Voice Calls', icon: Phone, subsections: [
    { id: 'voice-how', label: 'How calls work' },
    { id: 'voice-twilio', label: 'Twilio setup' },
    { id: 'voice-latency', label: 'Latency optimization' },
  ]},
  { id: 'policy', label: 'Company Policy', icon: Settings },
  { id: 'analytics', label: 'Analytics & Calls', icon: BarChart3 },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'pipeline', label: 'AI Pipeline', icon: Brain },
  { id: 'observability', label: 'Observability', icon: Layers },
  { id: 'api', label: 'API Reference', icon: Code2, subsections: [
    { id: 'api-auth', label: 'Authentication' },
    { id: 'api-agents', label: 'Agents endpoints' },
    { id: 'api-conversations', label: 'Conversations' },
    { id: 'api-docs', label: 'Documents' },
  ]},
  { id: 'security', label: 'Security', icon: Shield },
]

// ── Re-usable doc blocks ───────────────────────────────────────────────────────

function DocHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-2xl font-bold text-stone-900 mt-12 mb-4 scroll-mt-24 flex items-center gap-3 group">
      {children}
      <a href={`#${id}`} className="opacity-0 group-hover:opacity-40 text-stone-400 text-lg">#</a>
    </h2>
  )
}

function DocSub({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-lg font-semibold text-stone-800 mt-8 mb-3 scroll-mt-24">
      {children}
    </h3>
  )
}

function DocP({ children }: { children: React.ReactNode }) {
  return <p className="text-stone-600 leading-relaxed mb-4">{children}</p>
}

function DocCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-stone-100 text-amber-700 px-1.5 py-0.5 rounded text-sm font-mono border border-stone-200">
      {children}
    </code>
  )
}

function DocBlock({ children, lang = 'bash' }: { children: string; lang?: string }) {
  return (
    <div className="relative my-4 rounded-xl overflow-hidden border border-stone-200 shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 bg-stone-100 border-b border-stone-200">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-amber-400" />
          <div className="w-3 h-3 rounded-full bg-emerald-400" />
        </div>
        <span className="text-xs text-stone-500 font-mono">{lang}</span>
      </div>
      <pre className="bg-stone-50 p-4 overflow-x-auto text-sm font-mono text-stone-700 leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  )
}

function Note({ type = 'info', children }: { type?: 'info' | 'warn' | 'tip'; children: React.ReactNode }) {
  const styles = {
    info: { bg: 'bg-blue-50 border-blue-200', icon: Info, text: 'text-blue-800', label: 'Info' },
    warn: { bg: 'bg-amber-50 border-amber-200', icon: AlertTriangle, text: 'text-amber-800', label: 'Warning' },
    tip:  { bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2, text: 'text-emerald-800', label: 'Tip' },
  }
  const s = styles[type]
  return (
    <div className={`flex gap-3 p-4 rounded-xl border my-4 ${s.bg}`}>
      <s.icon className={`h-5 w-5 mt-0.5 shrink-0 ${s.text}`} />
      <div className={`text-sm ${s.text} leading-relaxed`}>{children}</div>
    </div>
  )
}

function StepList({ steps }: { steps: { title: string; desc: React.ReactNode }[] }) {
  return (
    <ol className="space-y-4 my-4">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-4">
          <div className="shrink-0 w-7 h-7 rounded-full bg-amber-600 flex items-center justify-center text-white text-sm font-bold">
            {i + 1}
          </div>
          <div>
            <p className="font-semibold text-stone-900">{s.title}</p>
            <div className="text-stone-600 text-sm mt-1">{s.desc}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto my-4 rounded-xl border border-stone-200 shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-stone-100 border-b border-stone-200">
          <tr>
            {headers.map(h => (
              <th key={h} className="text-left px-4 py-3 font-semibold text-stone-700">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 bg-white">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-stone-50 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-stone-600">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main content ───────────────────────────────────────────────────────────────

function DocContent() {
  return (
    <div className="max-w-3xl">

      {/* ── OVERVIEW ─────────────────────────────────────────────────────────── */}
      <DocHeading id="overview">
        <BookOpen className="h-6 w-6 text-amber-600" />
        Overview
      </DocHeading>
      <DocP>
        <strong className="text-stone-900">Velox AI</strong> is a production-ready platform for building, deploying, and monitoring intelligent AI voice agents. Configure an agent through our guided wizard, upload your knowledge base, connect a Twilio phone number, and your AI agent starts answering real calls — with sub-800ms voice-to-voice response times.
      </DocP>
      <DocP>
        The platform uses a modern, vendor-agnostic architecture:
      </DocP>
      <Table
        headers={['Layer', 'Technology', 'What it does']}
        rows={[
          ['Frontend', 'React 19 + Vite + TailwindCSS', 'Dashboard, agent wizard, playground, billing UI'],
          ['API', 'Node.js + Express + Prisma', 'REST endpoints, webhooks, multi-tenant data layer'],
          ['Voice', 'Pipecat + Daily.co WebRTC', 'Real-time voice pipeline with VAD and turn detection'],
          ['Agents', 'LangGraph + SGLang', 'Multi-tier LLM routing with sub-200ms TTFT'],
          ['Infra', 'PostgreSQL + Redis + Docker', 'Data persistence, state cache, containerized stack'],
        ]}
      />
      <Note type="tip">
        You only need Docker Desktop to run everything locally — no Node.js, Python, or database installation required.
      </Note>

      {/* ── QUICK START ──────────────────────────────────────────────────────── */}
      <DocHeading id="quickstart">
        <Zap className="h-6 w-6 text-amber-600" />
        Quick Start
      </DocHeading>

      <DocSub id="qs-setup">1. Local setup</DocSub>
      <StepList steps={[
        {
          title: 'Clone the repository',
          desc: <DocBlock lang="bash">{`git clone https://github.com/yashb98/Velox_AI.git
cd Velox_AI`}</DocBlock>,
        },
        {
          title: 'Copy the environment template',
          desc: <DocBlock lang="bash">{`cp .env.example .env`}</DocBlock>,
        },
        {
          title: 'Fill in API keys',
          desc: <>Open <DocCode>.env</DocCode> and add the required keys. The minimum required: <DocCode>DATABASE_URL</DocCode>, <DocCode>CLERK_SECRET_KEY</DocCode>, and <DocCode>KIMI_API_KEY</DocCode> (free tier LLM).</>,
        },
        {
          title: 'Start the full stack',
          desc: <DocBlock lang="bash">{`docker compose up --build`}</DocBlock>,
        },
        {
          title: 'Open in browser',
          desc: <>Navigate to <DocCode>http://localhost:5173</DocCode> for the dashboard.</>,
        },
      ]} />
      <Note type="info">
        For the free-tier setup with Neon PostgreSQL, Upstash Redis, and Kimi LLM, use <DocCode>docker-compose.free-tier.yml</DocCode> instead.
      </Note>

      <DocSub id="qs-first-agent">2. Create your first agent</DocSub>
      <DocP>
        Velox AI uses a guided <strong className="text-stone-900">onboarding wizard</strong> to create agents. This ensures all required configuration is captured step-by-step.
      </DocP>
      <StepList steps={[
        { title: 'Sign in', desc: 'Click Sign In on the landing page. Clerk handles authentication with email/password or OAuth.' },
        { title: 'Go to Agents', desc: <>Navigate to <strong className="text-stone-900">/agents</strong> and click <strong className="text-stone-900">+ New Agent</strong>.</> },
        {
          title: 'Complete the wizard',
          desc: (
            <>
              <p className="mb-2">The wizard walks you through 4 steps:</p>
              <Table
                headers={['Step', 'What you configure']}
                rows={[
                  ['1. Identity', 'Agent name and primary purpose (Sales, Support, etc.)'],
                  ['2. Personality', 'Tone of voice, response style, and brand persona'],
                  ['3. Knowledge', 'Connect to your Company Documents (RAG)'],
                  ['4. Tools', 'Enable integrations (CRM, calendar, order lookup)'],
                ]}
              />
            </>
          ),
        },
        { title: 'Save & Test', desc: 'Click Create Agent. You\'re automatically redirected to the Playground to test it.' },
      ]} />

      <DocSub id="qs-test">3. Test in Playground</DocSub>
      <DocP>
        The <strong className="text-stone-900">Playground</strong> is your sandbox for testing agents before going live. Type messages as if you were a caller and see how your agent responds in real-time.
      </DocP>
      <Note type="tip">
        Press <DocCode>Cmd+K</DocCode> (Mac) or <DocCode>Ctrl+K</DocCode> (Windows) to clear the conversation. Press <DocCode>Cmd+E</DocCode> to export the chat as JSON for debugging.
      </Note>

      <DocSub id="qs-phone">4. Connect a phone number</DocSub>
      <StepList steps={[
        { title: 'Buy a Twilio number', desc: <>Log in to console.twilio.com → Phone Numbers → Buy a Number.</> },
        { title: 'Expose your local API', desc: <DocBlock lang="bash">{`ngrok http 8080
# Copy the HTTPS URL, e.g. https://abc123.ngrok.io`}</DocBlock> },
        {
          title: 'Set the webhook',
          desc: <>In Twilio Console → Phone Number → Voice → A Call Comes In, set the URL to:<br /><DocCode>https://abc123.ngrok.io/voice/incoming</DocCode></>,
        },
        { title: 'Add credentials to .env', desc: <>Set <DocCode>TWILIO_AUTH_TOKEN</DocCode> and <DocCode>TWILIO_ACCOUNT_SID</DocCode> then restart the containers.</> },
        { title: 'Call the number', desc: 'Your AI agent will answer live!' },
      ]} />

      {/* ── AGENTS ───────────────────────────────────────────────────────────── */}
      <DocHeading id="agents">
        <Bot className="h-6 w-6 text-violet-600" />
        Agents
      </DocHeading>

      <DocSub id="agents-wizard">Onboarding wizard</DocSub>
      <DocP>
        Every agent in Velox AI is created through a guided wizard that ensures proper configuration. The wizard covers:
      </DocP>
      <Table
        headers={['Step', 'Fields', 'Why it matters']}
        rows={[
          ['Identity', 'Name, Purpose, Phone Number', 'Defines who the agent is and what calls it handles'],
          ['Personality', 'Tone, Response Length, Persona', 'Shapes how the agent sounds and communicates'],
          ['Knowledge', 'Document Collections', 'Connects RAG for accurate, grounded answers'],
          ['Tools', 'CRM, Calendar, Order Lookup, etc.', 'Enables actions beyond just conversation'],
        ]}
      />
      <DocP>
        After creation, you can edit any agent from the Agents page by clicking <strong className="text-stone-900">Edit</strong> on the agent card.
      </DocP>

      <DocSub id="agents-voice">Voice options</DocSub>
      <DocP>
        Velox AI supports multiple TTS providers for natural-sounding voice output:
      </DocP>
      <Table
        headers={['Provider', 'Voice ID format', 'Quality', 'Latency']}
        rows={[
          ['Cartesia Sonic', 'sonic-english-anna', 'Ultra-high', '~75ms TTFB'],
          ['Deepgram Aura', 'aura-asteria-en', 'High', '~150ms'],
          ['ElevenLabs Flash', 'el_VOICE_ID', 'Ultra-high', '~200ms'],
        ]}
      />
      <Note type="info">
        Voice IDs starting with <DocCode>el_</DocCode> route to ElevenLabs. Set <DocCode>ELEVENLABS_API_KEY</DocCode> in your <DocCode>.env</DocCode> to enable it.
      </Note>

      <DocSub id="agents-prompt">System prompts</DocSub>
      <DocP>
        The system prompt defines your agent's behavior. For voice agents, keep responses short and conversational:
      </DocP>
      <DocBlock lang="text">{`You are Alex, a friendly customer support agent for Acme Corp.

PERSONA
- Speak conversationally and warmly, as if on a phone call
- Keep responses under 3 sentences — this is voice, not chat
- Never mention you are an AI unless directly asked

CAPABILITIES
- Look up order status using the check_order_status tool
- Check product availability with check_item_stock
- Book appointments using book_appointment
- Transfer to a human if the customer requests it

RULES
- Never make up order information — always use tools
- Confirm the customer's name before looking up their account
- If unsure, say "Let me check on that for you"`}</DocBlock>
      <Note type="tip">
        Voice responses should be 1–3 sentences. The AI is speaking aloud, not writing an email.
      </Note>

      <DocSub id="agents-tools">Tool integrations</DocSub>
      <DocP>
        Tools let your agent take real actions — looking up orders, booking appointments, checking stock. Configure tools in the agent wizard or edit page.
      </DocP>
      <Table
        headers={['Tool', 'What it does', 'Config required']}
        rows={[
          ['Order Lookup', 'Retrieves order status and tracking', 'ORDER_API_URL'],
          ['Inventory Check', 'Checks product availability', 'INVENTORY_API_URL'],
          ['Appointment Booking', 'Schedules callbacks or visits', 'CALENDAR_API_URL'],
          ['Customer Profile', 'Fetches account history', 'CRM_API_URL'],
          ['Human Handoff', 'Transfers to live agent', 'HANDOFF_API_URL'],
          ['Knowledge Search', 'Searches your documents', 'Auto-enabled'],
        ]}
      />

      {/* ── COMPANY DOCUMENTS ───────────────────────────────────────────────── */}
      <DocHeading id="documents">
        <FileText className="h-6 w-6 text-emerald-600" />
        Company Documents
      </DocHeading>

      <DocSub id="docs-what">What is RAG?</DocSub>
      <DocP>
        <strong className="text-stone-900">Retrieval-Augmented Generation (RAG)</strong> lets your AI agent answer questions using your own documents instead of relying solely on training data. When a caller asks a question, Velox AI searches your document library for relevant content and includes it in the AI's context — resulting in accurate, grounded answers.
      </DocP>

      <DocSub id="docs-upload">Uploading documents</DocSub>
      <StepList steps={[
        { title: 'Go to Company Documents', desc: <>Navigate to <DocCode>/documents</DocCode> in the dashboard.</> },
        {
          title: 'Upload your files',
          desc: <>Drag and drop files or click to browse. Supported formats: <DocCode>.pdf</DocCode>, <DocCode>.txt</DocCode>, <DocCode>.docx</DocCode>, <DocCode>.md</DocCode></>,
        },
        {
          title: 'Processing happens automatically',
          desc: 'Documents are chunked, embedded, and indexed. You\'ll see a progress indicator during processing.',
        },
        {
          title: 'Connect to agents',
          desc: 'When creating or editing an agent, select which document collections to use in the Knowledge step.',
        },
      ]} />
      <Note type="info">
        Duplicate chunks are automatically detected and skipped. Large documents are split into ~500-token chunks for optimal retrieval.
      </Note>

      <DocSub id="docs-search">Hybrid search</DocSub>
      <DocP>
        Velox AI uses <strong className="text-stone-900">2-tier hybrid search</strong> optimized for voice latency:
      </DocP>
      <Table
        headers={['Tier', 'Method', 'Latency', 'Use case']}
        rows={[
          ['Fast', 'Qdrant vector + BM25 keyword', '<100ms', 'Most queries — product names, order IDs, FAQs'],
          ['Complex', 'LangGraph agentic + HyDE', '<500ms', 'Multi-hop reasoning, complex policy questions'],
        ]}
      />

      {/* ── PLAYGROUND ───────────────────────────────────────────────────────── */}
      <DocHeading id="playground">
        <PlayCircle className="h-6 w-6 text-cyan-600" />
        Playground
      </DocHeading>
      <DocP>
        The Playground is your testing sandbox — chat with any agent exactly as a caller would, without making real phone calls.
      </DocP>

      <DocSub id="pg-features">Features</DocSub>
      <Table
        headers={['Feature', 'How to use']}
        rows={[
          ['Send messages', 'Type in the input box and press Enter or click Send'],
          ['View tool calls', 'Tool executions appear as purple cards in the conversation'],
          ['Clear chat', 'Cmd+K (Mac) / Ctrl+K (Windows) or the Clear button'],
          ['Export conversation', 'Cmd+E downloads the full chat as JSON'],
          ['Template cards', 'Click any template to fire a pre-built test scenario'],
        ]}
      />

      <DocSub id="pg-inspector">Inspector panel</DocSub>
      <DocP>
        The right sidebar shows real-time metrics and configuration:
      </DocP>
      <Table
        headers={['Section', 'What it shows']}
        rows={[
          ['Configuration', 'Model, temperature, max tokens, enabled tools'],
          ['Live Metrics', 'Messages, avg latency, total tokens, estimated cost'],
          ['Event Log', 'Last 5 events (messages, tool calls) with timestamps'],
          ['System Prompt', 'The agent\'s full system prompt for reference'],
        ]}
      />

      <DocSub id="pg-templates">Test templates</DocSub>
      <DocP>
        The Playground includes 4 pre-built test scenarios:
      </DocP>
      <Table
        headers={['Template', 'Tests']}
        rows={[
          ['Test Knowledge Base', 'RAG retrieval from your documents'],
          ['Simulate Customer Call', 'Multi-turn conversation flow'],
          ['Check Tool Integrations', 'Tool execution and API connections'],
          ['Multi-Step Workflow', 'Complex scenarios requiring multiple tools'],
        ]}
      />

      {/* ── VOICE CALLS ──────────────────────────────────────────────────────── */}
      <DocHeading id="voice">
        <Phone className="h-6 w-6 text-emerald-600" />
        Voice Calls
      </DocHeading>

      <DocSub id="voice-how">How calls work end-to-end</DocSub>
      <DocP>
        When someone calls your Twilio number, here's the complete flow:
      </DocP>
      <DocBlock lang="text">{`1.  Twilio PSTN → POST /voice/incoming
      └── Returns TwiML connecting to Daily.co WebRTC room

2.  Pipecat voice pipeline starts
      └── Silero VAD detects speech
      └── Deepgram/Ultravox STT transcribes in real-time

3.  Transcript → LangGraph agent
      └── T0 Router classifies intent (<30ms)
      └── Routes to appropriate model tier:
          T1 Fast:   Nemotron Nano    (~100ms TTFT)
          T2 Medium: Qwen3.5-35B      (~200ms TTFT)
          T3 Heavy:  Kimi K2.5 API    (~500ms TTFT)

4.  Tool calls (if needed)
      └── Executed in parallel when possible
      └── Results injected back to LLM

5.  Response → TTS (Cartesia Sonic)
      └── ~75ms TTFB, streamed back to caller

6.  Call ends → metrics logged
      └── Duration, cost, sentiment, transcript saved`}</DocBlock>

      <DocSub id="voice-twilio">Twilio setup</DocSub>
      <StepList steps={[
        { title: 'Create a Twilio account', desc: <>Sign up at twilio.com. Free trial includes credit to get started.</> },
        { title: 'Buy a phone number', desc: <>Console → Phone Numbers → Buy a Number. Choose local or toll-free.</> },
        {
          title: 'Configure the webhook',
          desc: <>
            Phone Numbers → Active Numbers → select your number.<br />
            Under <strong className="text-stone-900">Voice Configuration</strong>:<br />
            <DocCode>https://your-domain.com/voice/incoming</DocCode>
          </>,
        },
        { title: 'Add credentials', desc: <DocBlock lang="env">{`TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token`}</DocBlock> },
      ]} />

      <DocSub id="voice-latency">Latency optimization</DocSub>
      <DocP>
        Velox AI targets <strong className="text-stone-900">sub-800ms voice-to-voice latency</strong>. Here's the budget breakdown:
      </DocP>
      <Table
        headers={['Stage', 'Target', 'Optimization']}
        rows={[
          ['Turn Detection', '<75ms', 'Silero VAD + semantic end-of-turn classifier'],
          ['STT', '<100ms', 'Streaming transcription, or 0ms with Ultravox'],
          ['LLM TTFT', '<200ms', 'SGLang with RadixAttention prefix caching'],
          ['TTS TTFB', '<75ms', 'Cartesia Sonic streaming'],
          ['PSTN overhead', '~300ms', 'Unavoidable, built into budget'],
        ]}
      />

      {/* ── COMPANY POLICY ────────────────────────────────────────────────────── */}
      <DocHeading id="policy">
        <Settings className="h-6 w-6 text-amber-600" />
        Company Policy
      </DocHeading>
      <DocP>
        The <strong className="text-stone-900">Company Policy</strong> page lets you define organization-wide rules that apply to all agents. This includes:
      </DocP>
      <Table
        headers={['Section', 'What you configure']}
        rows={[
          ['Brand Voice', 'Company name, tone, language style'],
          ['Escalation Rules', 'When to transfer to humans, hold procedures'],
          ['Privacy Guidelines', 'Data handling, what agents can/cannot discuss'],
          ['Compliance', 'Industry-specific regulations, disclaimers'],
        ]}
      />
      <DocP>
        Policy settings are automatically injected into every agent's context, ensuring consistent behavior across your organization.
      </DocP>

      {/* ── ANALYTICS ────────────────────────────────────────────────────────── */}
      <DocHeading id="analytics">
        <BarChart3 className="h-6 w-6 text-indigo-600" />
        Analytics & Calls
      </DocHeading>
      <DocP>
        The <strong className="text-stone-900">Calls</strong> page shows your complete conversation history with filtering and search.
      </DocP>
      <Table
        headers={['Column', 'Description']}
        rows={[
          ['Status', 'Active (ongoing), Completed, Failed, or Abandoned'],
          ['Duration', 'Wall-clock time from first audio to call end'],
          ['Messages', 'Total turns in the conversation'],
          ['Agent', 'Which agent handled the call'],
          ['Sentiment', 'AI-computed: Positive (>0.1) / Negative (<-0.1) / Neutral'],
          ['Cost', 'Minutes consumed from your balance'],
        ]}
      />
      <DocP>
        Click any call row to see the full transcript, tool calls, and per-turn metrics.
      </DocP>

      {/* ── BILLING ──────────────────────────────────────────────────────────── */}
      <DocHeading id="billing">
        <CreditCard className="h-6 w-6 text-emerald-600" />
        Billing
      </DocHeading>
      <DocP>
        Velox AI uses <strong className="text-stone-900">usage-based pricing</strong>. Buy a block of minutes each month — they're deducted as calls are made.
      </DocP>
      <Table
        headers={['Plan', 'Price', 'Minutes', 'Agents', 'Support']}
        rows={[
          ['Starter', '$49/mo', '1,000', 'Up to 5', 'Email'],
          ['Pro', '$199/mo', '5,000', 'Unlimited', 'Priority'],
          ['Enterprise', '$499/mo', '20,000', 'Unlimited', '24/7 + SLA'],
        ]}
      />
      <DocP>
        Checkout is handled by Stripe. After subscribing, minutes are instantly added to your balance. View all transactions in the Billing page.
      </DocP>
      <Note type="warn">
        When your balance reaches zero, incoming calls receive a <DocCode>402 Payment Required</DocCode> response and are not connected.
      </Note>

      {/* ── AI PIPELINE ──────────────────────────────────────────────────────── */}
      <DocHeading id="pipeline">
        <Brain className="h-6 w-6 text-violet-600" />
        AI Pipeline
      </DocHeading>
      <DocP>
        The Velox AI pipeline uses <strong className="text-stone-900">LangGraph</strong> for orchestration and <strong className="text-stone-900">SGLang</strong> for inference, with intelligent multi-tier routing:
      </DocP>
      <DocBlock lang="text">{`Query routing architecture:

                    ┌─────────────────┐
User utterance ────► T0 Router       │ Intent classification
                    │  Qwen3.5-3B    │ Routes to appropriate tier
                    │  <30ms         │
                    └────────┬───────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│ T1 Fast        │  │ T2 Medium      │  │ T3 Heavy       │
│ Nemotron Nano  │  │ Qwen3.5-35B    │  │ Kimi K2.5 API  │
│ ~100ms TTFT    │  │ ~200ms TTFT    │  │ ~500ms TTFT    │
│ 70-80% of calls│  │ Tool calls     │  │ Complex cases  │
└────────────────┘  └────────────────┘  └────────────────┘`}</DocBlock>
      <DocP>
        The router uses intent classification to decide which model handles each turn. Simple greetings and FAQs go to T1 for maximum speed. Tool calls and multi-turn reasoning go to T2. Complex edge cases fall back to T3.
      </DocP>

      {/* ── OBSERVABILITY ────────────────────────────────────────────────────── */}
      <DocHeading id="observability">
        <Layers className="h-6 w-6 text-teal-600" />
        Observability
      </DocHeading>
      <DocP>
        Velox AI includes comprehensive observability:
      </DocP>

      <h4 className="text-base font-semibold text-stone-800 mt-6 mb-2">LangSmith Tracing</h4>
      <DocP>
        Every conversation is traced end-to-end in LangSmith. Set <DocCode>LANGSMITH_API_KEY</DocCode> and <DocCode>LANGSMITH_PROJECT</DocCode> to enable:
      </DocP>
      <ul className="list-disc list-inside text-stone-600 space-y-1 mb-4 ml-2">
        <li><strong className="text-stone-900">LangGraph traces</strong> — full state machine execution</li>
        <li><strong className="text-stone-900">LLM spans</strong> — prompt, response, tokens, latency</li>
        <li><strong className="text-stone-900">Tool spans</strong> — name, arguments, result</li>
        <li><strong className="text-stone-900">Retrieval spans</strong> — RAG queries and results</li>
      </ul>

      <h4 className="text-base font-semibold text-stone-800 mt-6 mb-2">Prometheus Metrics</h4>
      <DocP>Available at <DocCode>http://localhost:8080/metrics</DocCode>:</DocP>
      <Table
        headers={['Metric', 'Type', 'Description']}
        rows={[
          ['velox_calls_total', 'Counter', 'Total calls by status'],
          ['velox_active_calls', 'Gauge', 'Currently open connections'],
          ['velox_llm_latency_seconds', 'Histogram', 'LLM response time (p50/p95/p99)'],
          ['velox_voice_e2e_latency', 'Histogram', 'Full turn latency: STT → LLM → TTS'],
        ]}
      />

      {/* ── API REFERENCE ────────────────────────────────────────────────────── */}
      <DocHeading id="api">
        <Code2 className="h-6 w-6 text-pink-600" />
        API Reference
      </DocHeading>

      <DocSub id="api-auth">Authentication</DocSub>
      <DocP>
        All protected routes require a Clerk JWT in the <DocCode>Authorization</DocCode> header:
      </DocP>
      <DocBlock lang="http">{`GET /api/agents HTTP/1.1
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...`}</DocBlock>

      <DocSub id="api-agents">Agents endpoints</DocSub>
      <Table
        headers={['Method', 'Route', 'Description']}
        rows={[
          ['GET', '/api/agents', 'List all agents for the organization'],
          ['POST', '/api/agents', 'Create a new agent'],
          ['GET', '/api/agents/:id', 'Get agent by ID'],
          ['PATCH', '/api/agents/:id', 'Update agent'],
          ['DELETE', '/api/agents/:id', 'Delete agent'],
        ]}
      />

      <DocSub id="api-conversations">Conversations endpoints</DocSub>
      <Table
        headers={['Method', 'Route', 'Description']}
        rows={[
          ['GET', '/api/conversations', 'List conversations (paginated)'],
          ['GET', '/api/conversations/:id', 'Get conversation with messages'],
        ]}
      />

      <DocSub id="api-docs">Document endpoints</DocSub>
      <Table
        headers={['Method', 'Route', 'Description']}
        rows={[
          ['POST', '/api/documents/upload', 'Upload document (multipart)'],
          ['GET', '/api/documents', 'List documents'],
          ['DELETE', '/api/documents/:id', 'Delete document'],
        ]}
      />

      {/* ── SECURITY ─────────────────────────────────────────────────────────── */}
      <DocHeading id="security">
        <Shield className="h-6 w-6 text-stone-600" />
        Security
      </DocHeading>
      <Table
        headers={['Feature', 'Implementation']}
        rows={[
          ['Authentication', 'Clerk RS256 JWT validated on every request'],
          ['Multi-tenancy', 'All queries filtered by org_id from JWT'],
          ['Webhook validation', 'Twilio and Stripe signatures verified'],
          ['Billing gate', 'WebSocket upgrade refused with 402 if no credits'],
          ['CORS', 'Restricted to configured DASHBOARD_URL'],
          ['Headers', 'Helmet security headers on all responses'],
        ]}
      />
      <Note type="warn">
        Change default API keys (<DocCode>ADMIN_API_KEY</DocCode>) before deploying to production.
      </Note>

      {/* bottom padding */}
      <div className="h-24" />
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('overview')

  return (
    <div className="min-h-screen bg-[#faf9f7] text-stone-900">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-stone-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="text-stone-600 hover:text-stone-900 hover:bg-stone-100">
              <Link to="/" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <div className="h-4 w-px bg-stone-300" />
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-amber-600" />
              <span className="font-semibold text-stone-900">Velox AI</span>
              <ChevronRight className="h-4 w-4 text-stone-400" />
              <span className="text-stone-600">Documentation</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
              v2.0
            </Badge>
            <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-500 text-white">
              <Link to="/agents">Open Dashboard</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto flex">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto border-r border-stone-200 bg-white py-6 px-3 hidden lg:block">
          <nav className="space-y-1">
            {sections.map((section) => (
              <div key={section.id}>
                <a
                  href={`#${section.id}`}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeSection === section.id
                      ? 'bg-amber-100 text-amber-800 font-medium'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                  }`}
                >
                  <section.icon className="h-4 w-4 shrink-0" />
                  {section.label}
                </a>
                {section.subsections && (
                  <div className="ml-4 mt-1 space-y-0.5">
                    {section.subsections.map((sub) => (
                      <a
                        key={sub.id}
                        href={`#${sub.id}`}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-stone-500 hover:text-stone-700 hover:bg-stone-100 transition-colors"
                      >
                        <ChevronRight className="h-3 w-3 shrink-0" />
                        {sub.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 px-8 py-10 bg-white border-x border-stone-100">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            {/* Page title */}
            <div className="mb-10">
              <div className="flex items-center gap-2 text-sm text-stone-500 mb-3">
                <BookOpen className="h-4 w-4" />
                <span>Velox AI Documentation</span>
              </div>
              <h1 className="text-4xl font-bold text-stone-900 mb-3">Platform Documentation</h1>
              <p className="text-lg text-stone-600">
                Everything you need to build, deploy, and scale AI voice agents with Velox AI.
              </p>
            </div>

            <DocContent />
          </motion.div>
        </main>

        {/* Right mini-nav (on-this-page) */}
        <div className="w-48 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto py-6 px-4 hidden xl:block bg-[#faf9f7]">
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-3">On this page</p>
          <nav className="space-y-1">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="block text-xs text-stone-500 hover:text-amber-600 py-1 transition-colors"
              >
                {s.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </div>
  )
}
