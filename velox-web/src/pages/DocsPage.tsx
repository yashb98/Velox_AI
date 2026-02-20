// src/pages/DocsPage.tsx — Full Velox AI in-app documentation

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
  Database,
  CreditCard,
  Shield,
  Code2,
  PlayCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  Layers,
  Brain,
  Wrench,
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
    { id: 'agents-create', label: 'Creating agents' },
    { id: 'agents-voice', label: 'Voice options' },
    { id: 'agents-prompt', label: 'Writing system prompts' },
    { id: 'agents-flow', label: 'Flow builder' },
  ]},
  { id: 'voice', label: 'Voice Calls', icon: Phone, subsections: [
    { id: 'voice-how', label: 'How calls work' },
    { id: 'voice-twilio', label: 'Twilio setup' },
    { id: 'voice-ngrok', label: 'Local dev with ngrok' },
  ]},
  { id: 'knowledge', label: 'Knowledge Base', icon: Database, subsections: [
    { id: 'kb-what', label: 'What is RAG?' },
    { id: 'kb-upload', label: 'Uploading documents' },
    { id: 'kb-search', label: 'Hybrid search' },
  ]},
  { id: 'tools', label: 'Tool Integrations', icon: Wrench, subsections: [
    { id: 'tools-list', label: 'Available tools' },
    { id: 'tools-config', label: 'Configuring tools' },
  ]},
  { id: 'playground', label: 'Playground', icon: PlayCircle },
  { id: 'analytics', label: 'Analytics & Calls', icon: BarChart3 },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'api', label: 'API Reference', icon: Code2, subsections: [
    { id: 'api-auth', label: 'Authentication' },
    { id: 'api-agents', label: 'Agents endpoints' },
    { id: 'api-conversations', label: 'Conversations' },
    { id: 'api-docs', label: 'Documents' },
    { id: 'api-billing', label: 'Billing' },
  ]},
  { id: 'pipeline', label: 'AI Pipeline', icon: Brain },
  { id: 'observability', label: 'Observability', icon: BarChart3 },
  { id: 'security', label: 'Security', icon: Shield },
]

// ── Re-usable doc blocks ───────────────────────────────────────────────────────

function DocHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-2xl font-bold text-white mt-12 mb-4 scroll-mt-24 flex items-center gap-3 group">
      {children}
      <a href={`#${id}`} className="opacity-0 group-hover:opacity-40 text-slate-400 text-lg">#</a>
    </h2>
  )
}

function DocSub({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-lg font-semibold text-slate-100 mt-8 mb-3 scroll-mt-24">
      {children}
    </h3>
  )
}

function DocP({ children }: { children: React.ReactNode }) {
  return <p className="text-slate-300 leading-relaxed mb-4">{children}</p>
}

function DocCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-slate-800 text-blue-300 px-1.5 py-0.5 rounded text-sm font-mono border border-slate-700">
      {children}
    </code>
  )
}

function DocBlock({ children, lang = 'bash' }: { children: string; lang?: string }) {
  return (
    <div className="relative my-4 rounded-lg overflow-hidden border border-slate-700">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/60" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
          <div className="w-3 h-3 rounded-full bg-green-500/60" />
        </div>
        <span className="text-xs text-slate-500 font-mono">{lang}</span>
      </div>
      <pre className="bg-slate-900 p-4 overflow-x-auto text-sm font-mono text-slate-200 leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  )
}

function Note({ type = 'info', children }: { type?: 'info' | 'warn' | 'tip'; children: React.ReactNode }) {
  const styles = {
    info: { bg: 'bg-blue-950/60 border-blue-500/40', icon: Info, text: 'text-blue-300', label: 'Info' },
    warn: { bg: 'bg-amber-950/60 border-amber-500/40', icon: AlertTriangle, text: 'text-amber-300', label: 'Warning' },
    tip:  { bg: 'bg-emerald-950/60 border-emerald-500/40', icon: CheckCircle2, text: 'text-emerald-300', label: 'Tip' },
  }
  const s = styles[type]
  return (
    <div className={`flex gap-3 p-4 rounded-lg border my-4 ${s.bg}`}>
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
          <div className="shrink-0 w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
            {i + 1}
          </div>
          <div>
            <p className="font-semibold text-white">{s.title}</p>
            <div className="text-slate-300 text-sm mt-1">{s.desc}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto my-4 rounded-lg border border-slate-700">
      <table className="w-full text-sm">
        <thead className="bg-slate-800 border-b border-slate-700">
          <tr>
            {headers.map(h => (
              <th key={h} className="text-left px-4 py-3 font-semibold text-slate-200">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-800/50 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-slate-300">{cell}</td>
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
        <BookOpen className="h-6 w-6 text-blue-400" />
        Overview
      </DocHeading>
      <DocP>
        <strong className="text-white">Velox AI</strong> is a production-ready platform for building, deploying, and monitoring intelligent AI voice agents. Plug in a Twilio phone number, design a conversation flow, upload your knowledge base, and your AI agent starts answering real calls — with sub-2-second response times powered by Gemini 2.5 Flash.
      </DocP>
      <DocP>
        The platform consists of four core layers:
      </DocP>
      <Table
        headers={['Layer', 'Technology', 'What it does']}
        rows={[
          ['Frontend', 'React 19 + Vite', 'Dashboard, flow builder, playground, billing UI'],
          ['API', 'Node.js + Express + Prisma', 'REST endpoints, WebSocket call handling, Twilio webhooks'],
          ['Agents', 'Python + FastAPI + Google ADK', 'Multi-agent LLM routing pipeline'],
          ['Infra', 'PostgreSQL + Redis + Docker', 'Data persistence, call-state cache, local dev stack'],
        ]}
      />
      <Note type="tip">
        You only need Docker Desktop to run everything locally — no Node.js, Python, or database installation required.
      </Note>

      {/* ── QUICK START ──────────────────────────────────────────────────────── */}
      <DocHeading id="quickstart">
        <Zap className="h-6 w-6 text-amber-400" />
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
          desc: <>Open <DocCode>.env</DocCode> and add the required keys. See the <a href="#api-auth" className="text-blue-400 underline underline-offset-2">Environment Variables</a> section for the full reference.</>,
        },
        {
          title: 'Start the full stack',
          desc: <DocBlock lang="bash">{`docker compose --profile mlflow up --build`}</DocBlock>,
        },
        {
          title: 'Open in browser',
          desc: <>Navigate to <DocCode>http://localhost:5173</DocCode> for the dashboard and <DocCode>http://localhost:5001</DocCode> for MLflow.</>,
        },
      ]} />

      <DocSub id="qs-first-agent">2. Create your first agent</DocSub>
      <StepList steps={[
        { title: 'Sign in', desc: 'Click Sign In on the landing page. Clerk handles authentication.' },
        { title: 'Go to Agents', desc: <>Navigate to <strong className="text-white">/agents</strong> and click <strong className="text-white">New Agent</strong>.</> },
        {
          title: 'Fill in the agent form',
          desc: (
            <Table
              headers={['Field', 'Description', 'Example']}
              rows={[
                ['Name', 'Human-readable agent name', 'Support Bot'],
                ['Phone Number', 'Twilio number to assign (optional for testing)', '+1 555 000 0000'],
                ['Voice ID', 'Deepgram Aura or ElevenLabs voice', 'aura-asteria-en'],
                ['System Prompt', 'Instructions defining the agent\'s behaviour', 'You are a helpful support agent for Acme Corp…'],
              ]}
            />
          ),
        },
        { title: 'Save', desc: 'Click Create Agent. The agent is now live and ready to test.' },
      ]} />

      <DocSub id="qs-test">3. Test in Playground</DocSub>
      <DocP>
        On the Agents page, click the <strong className="text-white">Test</strong> button on any agent card. The Playground opens — type messages as if you were a caller. You'll see the AI response in real time along with latency, token counts, and any tool calls made.
      </DocP>
      <Note type="tip">
        Press <DocCode>Cmd+K</DocCode> (or <DocCode>Ctrl+K</DocCode>) to clear the conversation. Press <DocCode>Cmd+E</DocCode> to export the chat as JSON.
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
        { title: 'Add the Twilio auth token', desc: <>Set <DocCode>TWILIO_AUTH_TOKEN</DocCode> in your <DocCode>.env</DocCode> and restart the API container.</> },
        { title: 'Call the number', desc: 'Your AI agent will answer live!' },
      ]} />

      {/* ── AGENTS ───────────────────────────────────────────────────────────── */}
      <DocHeading id="agents">
        <Bot className="h-6 w-6 text-violet-400" />
        Agents
      </DocHeading>

      <DocSub id="agents-create">Creating and managing agents</DocSub>
      <DocP>
        An <strong className="text-white">agent</strong> is the core entity in Velox AI. Each agent has its own identity, voice, system prompt, and optionally a dedicated phone number. You can create as many agents as your plan allows.
      </DocP>
      <DocP>
        From <strong className="text-white">Agents → New Agent</strong> you can set:
      </DocP>
      <Table
        headers={['Property', 'Required', 'Description']}
        rows={[
          ['Name', 'Yes', 'Display name shown in the dashboard'],
          ['Phone Number', 'No', 'Twilio number that triggers this agent on inbound calls'],
          ['Voice ID', 'Yes', 'TTS voice (see Voice options below)'],
          ['System Prompt', 'Yes', 'Full instructions for the AI — persona, scope, rules'],
          ['Is Active', 'Auto', 'Toggle to enable/disable without deleting'],
        ]}
      />

      <DocSub id="agents-voice">Voice options</DocSub>
      <DocP>
        Velox AI supports two TTS providers:
      </DocP>
      <Table
        headers={['Provider', 'Voice ID format', 'Quality', 'Latency']}
        rows={[
          ['Deepgram Aura', 'aura-asteria-en', 'High', '~200ms'],
          ['Deepgram Aura', 'aura-luna-en', 'High', '~200ms'],
          ['Deepgram Aura', 'aura-orion-en', 'High', '~200ms'],
          ['ElevenLabs', 'el_VOICE_ID (prefix with el_)', 'Ultra-high', '~400ms'],
        ]}
      />
      <Note type="info">
        Any voice ID starting with <DocCode>el_</DocCode> is automatically routed to ElevenLabs. Set <DocCode>ELEVENLABS_API_KEY</DocCode> in your <DocCode>.env</DocCode> to enable it.
      </Note>

      <DocSub id="agents-prompt">Writing system prompts</DocSub>
      <DocP>
        The system prompt is the most important part of your agent configuration. It defines who the agent is, what it can do, and how it should behave.
      </DocP>
      <DocBlock lang="text">{`You are Alex, a friendly customer support agent for Acme Corp.

PERSONA
- Speak conversationally and warmly, as if on a phone call
- Keep responses under 3 sentences — this is voice, not chat
- Never mention you are an AI unless directly asked

CAPABILITIES
- Look up order status (use the check_order_status tool)
- Check product availability (use check_item_stock)
- Book appointments (use book_appointment)
- Transfer to a human agent if the customer is upset or requests it

RULES
- Never make up order status information
- Always confirm the customer's name before looking up their account
- If unsure, say "Let me check on that for you" and use a tool`}</DocBlock>
      <Note type="tip">
        Keep voice responses short. The AI is speaking aloud, not writing an email. Aim for 1–3 sentences per turn.
      </Note>

      <DocSub id="agents-flow">Flow builder</DocSub>
      <DocP>
        The <strong className="text-white">Flow Builder</strong> is a visual drag-and-drop editor for designing multi-step conversation flows. Navigate to an agent and click <strong className="text-white">Flow</strong> to open it.
      </DocP>
      <DocP>
        You can create nodes for:
      </DocP>
      <ul className="list-disc list-inside text-slate-300 space-y-1 mb-4 ml-2">
        <li><strong className="text-white">Prompt nodes</strong> — LLM response with custom instructions</li>
        <li><strong className="text-white">Condition nodes</strong> — branch based on intent or slot values</li>
        <li><strong className="text-white">Tool nodes</strong> — call an external API (order lookup, booking, etc.)</li>
        <li><strong className="text-white">Handoff nodes</strong> — transfer to a human agent</li>
        <li><strong className="text-white">End nodes</strong> — gracefully close the call</li>
      </ul>

      {/* ── VOICE CALLS ──────────────────────────────────────────────────────── */}
      <DocHeading id="voice">
        <Phone className="h-6 w-6 text-emerald-400" />
        Voice Calls
      </DocHeading>

      <DocSub id="voice-how">How calls work end-to-end</DocSub>
      <DocP>
        When someone calls your Twilio number, the following happens:
      </DocP>
      <DocBlock lang="text">{`1.  Twilio PSTN → POST /voice/incoming
      └── API returns TwiML: <Connect><Stream url="wss://…/media-stream?orgId=…" />

2.  Twilio → WebSocket upgrade to /media-stream
      └── API checks billing BEFORE handshake (returns 402 if no credits)

3.  Audio stream opens (mulaw 8kHz, 20ms chunks)
      └── Deepgram STT Nova-2 transcribes in real time

4.  Final transcript fires → orchestrator.ts
      └── Builds context: system prompt + RAG results + conversation history
      └── Sends to Google ADK agents pipeline (POST /generate on :8002)

5.  ADK routes intelligently:
      Phi-3 SLM  → simple FAQs, yes/no, short answers  (~50ms)
      Gemini Flash → multi-turn, tool calls, reasoning  (~400ms)
      Gemini Pro  → complex decisions, escalations      (~900ms)

6.  Tool call detected → registry.ts executes tool → result injected back

7.  Final response → TTS (Deepgram Aura or ElevenLabs)
      └── mulaw 8kHz audio streamed back to Twilio → caller hears response

8.  Call ends → DB write (cost, sentiment, duration) + Prometheus metrics`}</DocBlock>

      <DocSub id="voice-twilio">Twilio setup</DocSub>
      <StepList steps={[
        { title: 'Create a Twilio account', desc: <>Sign up at twilio.com. Free trial gives you $15 credit.</> },
        { title: 'Buy a phone number', desc: <>Console → Phone Numbers → Manage → Buy a Number. Choose a local or toll-free number.</> },
        {
          title: 'Configure the webhook',
          desc: <>
            Phone Numbers → Manage → Active Numbers → click your number.<br />
            Under <strong className="text-white">Voice Configuration</strong> → A Call Comes In:<br />
            <DocCode>https://your-domain.com/voice/incoming</DocCode>
          </>,
        },
        { title: 'Add credentials to .env', desc: <DocBlock lang="env">{`TWILIO_AUTH_TOKEN=your_auth_token_here`}</DocBlock> },
      ]} />

      <DocSub id="voice-ngrok">Local dev with ngrok</DocSub>
      <DocP>
        Twilio needs a public HTTPS URL to send webhooks. Use ngrok to tunnel your local port 8080:
      </DocP>
      <DocBlock lang="bash">{`# Install ngrok from https://ngrok.com/download
ngrok http 8080

# Output:
# Forwarding  https://abc123.ngrok.io -> http://localhost:8080

# Set this in Twilio → Voice webhook:
# https://abc123.ngrok.io/voice/incoming`}</DocBlock>
      <Note type="warn">
        ngrok URLs change every restart on the free plan. Use ngrok's reserved domains or a paid plan for stable URLs.
      </Note>

      {/* ── KNOWLEDGE BASE ───────────────────────────────────────────────────── */}
      <DocHeading id="knowledge">
        <Database className="h-6 w-6 text-rose-400" />
        Knowledge Base
      </DocHeading>

      <DocSub id="kb-what">What is RAG?</DocSub>
      <DocP>
        <strong className="text-white">Retrieval-Augmented Generation (RAG)</strong> lets your AI agent answer questions using your own documents instead of only its training data. When a caller asks a question, Velox AI searches your knowledge base for relevant text and injects it into the prompt — so the agent can give accurate, up-to-date answers grounded in your actual content.
      </DocP>

      <DocSub id="kb-upload">Uploading documents</DocSub>
      <StepList steps={[
        { title: 'Go to Knowledge Bases', desc: <>Navigate to <DocCode>/knowledge</DocCode> in the dashboard.</> },
        { title: 'Select a knowledge base', desc: 'Click on the KB card you want to upload to. It will be highlighted.' },
        {
          title: 'Upload your document',
          desc: <>Click <strong className="text-white">Upload to this KB</strong> or use the top upload panel. Supported formats: <DocCode>.pdf</DocCode>, <DocCode>.txt</DocCode></>,
        },
        {
          title: 'Wait for processing',
          desc: 'The document is chunked into ~500-token pieces, embedded using Gemini text-embedding-004, and stored in PostgreSQL with vector indexes.',
        },
      ]} />
      <Note type="info">
        Duplicate chunks are automatically detected and skipped. The upload result shows how many chunks were added vs skipped.
      </Note>

      <DocSub id="kb-search">Hybrid search</DocSub>
      <DocP>
        Every query against your knowledge base uses <strong className="text-white">hybrid search</strong> — a combination of:
      </DocP>
      <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-2">
        <li><strong className="text-white">Keyword search (BM25)</strong> — finds exact term matches, great for product names and order IDs</li>
        <li><strong className="text-white">Semantic search (vector)</strong> — finds conceptually similar content, great for paraphrased questions</li>
      </ul>
      <DocP>
        The results from both are merged, re-ranked, and the top chunks are injected into the LLM context window for each agent response.
      </DocP>

      {/* ── TOOLS ────────────────────────────────────────────────────────────── */}
      <DocHeading id="tools">
        <Wrench className="h-6 w-6 text-orange-400" />
        Tool Integrations
      </DocHeading>

      <DocSub id="tools-list">Available tools</DocSub>
      <DocP>
        Tools let your AI agent take real actions — looking up orders, booking appointments, checking stock — by calling your existing APIs. Velox AI ships with 6 built-in tool schemas:
      </DocP>
      <Table
        headers={['Tool', 'Trigger phrase examples', 'Requires', 'Returns']}
        rows={[
          ['check_order_status', '"Where is my order?" / "Order #12345"', 'ORDER_API_URL', 'Status, tracking, ETA'],
          ['check_item_stock', '"Is the blue widget in stock?"', 'INVENTORY_API_URL', 'Quantity, availability'],
          ['book_appointment', '"Book a callback" / "Schedule a visit"', 'CALENDAR_API_URL', 'Confirmation ID, time'],
          ['get_customer_profile', '"Look up my account" / "My name is Jane"', 'CRM_API_URL', 'Name, history, tier'],
          ['transfer_to_agent', '"Speak to a human" / frustrated tone', 'HANDOFF_API_URL', 'Transfer confirmation'],
          ['search_knowledge_base', 'Any FAQ or product question', 'FAQ_KB_ID', 'Relevant text chunks'],
        ]}
      />

      <DocSub id="tools-config">Configuring tools</DocSub>
      <DocP>
        Set the corresponding environment variable in your <DocCode>.env</DocCode> to enable each tool. Tools without a URL set are silently disabled — the agent won't attempt to call them.
      </DocP>
      <DocBlock lang="env">{`# Tool integrations — set the API endpoint for each tool you want to enable
ORDER_API_URL=https://api.yourstore.com/orders
ORDER_API_KEY=your_api_key

INVENTORY_API_URL=https://api.yourstore.com/inventory
CALENDAR_API_URL=https://calendar.yourapp.com/appointments
CRM_API_URL=https://crm.yourapp.com/customers
HANDOFF_API_URL=https://queue.yourcc.com/transfer

# Knowledge base UUID (get from /knowledge page)
FAQ_KB_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`}</DocBlock>
      <Note type="tip">
        Your API endpoints don't need to follow any specific schema — only the environment variable URL matters. Velox AI POSTs structured JSON to each URL and expects a JSON response.
      </Note>

      {/* ── PLAYGROUND ───────────────────────────────────────────────────────── */}
      <DocHeading id="playground">
        <PlayCircle className="h-6 w-6 text-cyan-400" />
        Playground
      </DocHeading>
      <DocP>
        The Playground lets you chat with any agent as if you were a caller — without needing a phone. It's the fastest way to test and iterate on your system prompt and tools.
      </DocP>
      <Table
        headers={['Feature', 'How to use']}
        rows={[
          ['Send a message', 'Type in the input box and press Enter or click Send'],
          ['View tool calls', 'Tool calls appear as yellow cards between messages'],
          ['Inspector panel', 'Right sidebar shows token count, cost, and latency per message'],
          ['Clear conversation', 'Cmd+K (Mac) / Ctrl+K (Windows) or the Clear button'],
          ['Export chat', 'Cmd+E / Ctrl+E downloads the full conversation as JSON'],
          ['Keyboard shortcut', 'Shift+Enter for a new line without sending'],
        ]}
      />
      <Note type="info">
        The Playground calls the same LLM pipeline as real calls — what works here will work on the phone, minus the voice layer.
      </Note>

      {/* ── ANALYTICS ────────────────────────────────────────────────────────── */}
      <DocHeading id="analytics">
        <BarChart3 className="h-6 w-6 text-indigo-400" />
        Analytics & Calls
      </DocHeading>
      <DocP>
        The <strong className="text-white">Dashboard</strong> shows real-time call metrics and the <strong className="text-white">Calls</strong> page shows the full conversation history.
      </DocP>
      <Table
        headers={['Metric', 'Where', 'Description']}
        rows={[
          ['Active Calls', 'Dashboard', 'WebSocket connections currently open (live calls)'],
          ["Today's Calls", 'Dashboard', 'Total calls started in the last 24 hours'],
          ['Completed', 'Dashboard', 'Calls that ended normally'],
          ['Failed / Abandoned', 'Dashboard', 'Calls that errored or the caller hung up early'],
          ['Call Volume Chart', 'Dashboard', '24-hour bar chart of calls per hour'],
          ['Duration', 'Calls page', 'Wall-clock time from first audio to call end'],
          ['Cost', 'Calls page', 'Minutes consumed (deducted from your balance)'],
          ['Sentiment', 'Calls page', 'AI-computed score: 😊 > 0.1 / 😞 < -0.1 / 😐 neutral'],
        ]}
      />
      <DocP>
        The Calls page supports filtering by <strong className="text-white">status</strong> (Active, Completed, Failed, Abandoned) and by <strong className="text-white">Agent ID</strong>. Results are paginated at 20 per page.
      </DocP>

      {/* ── BILLING ──────────────────────────────────────────────────────────── */}
      <DocHeading id="billing">
        <CreditCard className="h-6 w-6 text-green-400" />
        Billing
      </DocHeading>
      <DocP>
        Velox AI uses a <strong className="text-white">usage-based model</strong> — you buy a block of minutes each month and they're deducted as calls are made. There are no per-seat fees or hidden costs.
      </DocP>
      <Table
        headers={['Plan', 'Price', 'Minutes', 'Agents', 'Support']}
        rows={[
          ['Starter', '$49/mo', '1,000', 'Up to 5', 'Email'],
          ['Pro', '$199/mo', '5,000', 'Unlimited', 'Priority'],
          ['Enterprise', '$499/mo', '20,000', 'Unlimited', '24/7 dedicated + SLA'],
        ]}
      />
      <DocP>
        Checkout is handled by <strong className="text-white">Stripe</strong>. After subscribing, minutes are instantly added to your balance. All transactions (credits and usage debits) are visible in the Transaction History section of the Billing page.
      </DocP>
      <Note type="warn">
        Calls are gated at the WebSocket level — if your balance reaches zero, incoming calls receive a <DocCode>402 Payment Required</DocCode> response and are not connected.
      </Note>

      {/* ── API REFERENCE ────────────────────────────────────────────────────── */}
      <DocHeading id="api">
        <Code2 className="h-6 w-6 text-pink-400" />
        API Reference
      </DocHeading>

      <DocSub id="api-auth">Authentication</DocSub>
      <DocP>
        All protected API routes require a Clerk JWT token in the <DocCode>Authorization</DocCode> header:
      </DocP>
      <DocBlock lang="http">{`GET /api/agents HTTP/1.1
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...`}</DocBlock>
      <DocP>
        In the frontend, the <DocCode>api</DocCode> axios instance (in <DocCode>src/lib/api.ts</DocCode>) automatically attaches the Clerk session token to every request via a request interceptor.
      </DocP>
      <DocP>
        The Admin endpoint uses a separate key:
      </DocP>
      <DocBlock lang="http">{`POST /api/admin/run-eval HTTP/1.1
X-Admin-Key: your_admin_api_key_here`}</DocBlock>

      <DocSub id="api-agents">Agents endpoints</DocSub>
      <Table
        headers={['Method', 'Route', 'Body / Params', 'Response']}
        rows={[
          ['GET', '/api/agents', '—', 'Agent[]'],
          ['POST', '/api/agents', '{ name, phone_number, voice_id, system_prompt }', 'Agent'],
          ['GET', '/api/agents/:id', '—', 'Agent'],
          ['PATCH', '/api/agents/:id', 'Partial<Agent>', 'Agent'],
          ['DELETE', '/api/agents/:id', '—', '{ success: true }'],
        ]}
      />

      <DocSub id="api-conversations">Conversations endpoints</DocSub>
      <Table
        headers={['Method', 'Route', 'Query params', 'Response']}
        rows={[
          ['GET', '/api/conversations', 'page, limit, status, agentId', '{ conversations[], pagination }'],
          ['GET', '/api/conversations/:id', '—', 'Conversation + messages[]'],
        ]}
      />

      <DocSub id="api-docs">Document / Knowledge endpoints</DocSub>
      <Table
        headers={['Method', 'Route', 'Body', 'Response']}
        rows={[
          ['POST', '/api/documents/upload', 'multipart: file, kb_id', '{ status, chunks, skipped }'],
          ['GET', '/api/documents', 'kb_id (query)', 'Document[]'],
        ]}
      />

      <DocSub id="api-billing">Billing endpoints</DocSub>
      <Table
        headers={['Method', 'Route', 'Body', 'Response']}
        rows={[
          ['GET', '/api/billing/:orgId', '—', '{ credit_balance, current_plan, subscription, transactions }'],
          ['POST', '/api/billing/checkout', '{ orgId, planType, successUrl, cancelUrl }', '{ url }'],
          ['POST', '/api/billing/:orgId/cancel', '—', '{ success }'],
        ]}
      />

      {/* ── AI PIPELINE ──────────────────────────────────────────────────────── */}
      <DocHeading id="pipeline">
        <Brain className="h-6 w-6 text-purple-400" />
        AI Pipeline
      </DocHeading>
      <DocP>
        The multi-agent routing pipeline lives in the <DocCode>agents/</DocCode> service, built with <strong className="text-white">Google ADK (Agent Development Kit)</strong>.
      </DocP>
      <DocBlock lang="text">{`Query complexity routing:

                    ┌─────────────────┐
User utterance ────► Phi-3-mini SLM  │ Simple FAQs, yes/no, greetings
                    │  ~50ms          │ Runs locally in container, zero API cost
                    └────────┬────────┘
                      complex?│
                    ┌─────────▼────────┐
                    │  Gemini Flash    │ Multi-turn, tool calling, reasoning
                    │  ~400ms          │ ~70% of production calls land here
                    └────────┬─────────┘
                      critical?│
                    ┌──────────▼───────┐
                    │  Gemini Pro      │ Legal, medical, complex negotiation
                    │  ~900ms          │ Highest accuracy, highest cost
                    └──────────────────┘`}</DocBlock>
      <DocP>
        The router uses a lightweight intent classifier to decide which model handles each turn. Tool calls always go through Gemini (Flash or Pro) since Phi-3 doesn't support function calling.
      </DocP>
      <Note type="tip">
        The Phi-3 SLM is optional. Start it with <DocCode>docker compose --profile slm up</DocCode>. If not running, all queries fall through to Gemini Flash automatically.
      </Note>

      {/* ── OBSERVABILITY ────────────────────────────────────────────────────── */}
      <DocHeading id="observability">
        <Layers className="h-6 w-6 text-teal-400" />
        Observability
      </DocHeading>
      <DocP>
        Velox AI ships with three observability layers:
      </DocP>

      <h4 className="text-base font-semibold text-slate-100 mt-6 mb-2">Prometheus Metrics</h4>
      <DocP>Scraped at <DocCode>http://localhost:8080/metrics</DocCode>:</DocP>
      <Table
        headers={['Metric', 'Type', 'Labels', 'Description']}
        rows={[
          ['velox_calls_total', 'Counter', 'status', 'Total calls by status (completed/failed)'],
          ['velox_active_calls', 'Gauge', '—', 'Currently open WebSocket connections'],
          ['velox_llm_latency_seconds', 'Histogram', 'model', 'LLM response time with p50/p95/p99 buckets'],
          ['velox_tts_latency_seconds', 'Histogram', 'provider', 'TTS generation time'],
          ['velox_e2e_latency_seconds', 'Histogram', '—', 'Full turn latency: STT → LLM → TTS'],
        ]}
      />

      <h4 className="text-base font-semibold text-slate-100 mt-6 mb-2">MLflow</h4>
      <DocP>
        Start with <DocCode>--profile mlflow</DocCode> to get the MLflow UI at <DocCode>http://localhost:5001</DocCode>. The admin eval endpoint (<DocCode>POST /api/admin/run-eval</DocCode>) triggers a DeepEval test suite and logs results as MLflow experiments.
      </DocP>

      <h4 className="text-base font-semibold text-slate-100 mt-6 mb-2">LangFuse Tracing</h4>
      <DocP>
        Set <DocCode>LANGFUSE_PUBLIC_KEY</DocCode> and <DocCode>LANGFUSE_SECRET_KEY</DocCode> to enable per-call LLM tracing. Every call gets a trace with:
      </DocP>
      <ul className="list-disc list-inside text-slate-300 space-y-1 mb-4 ml-2">
        <li><strong className="text-white">STT span</strong> — transcript text, confidence score, word count</li>
        <li><strong className="text-white">LLM span</strong> — prompt, response, model, token count, latency</li>
        <li><strong className="text-white">Tool spans</strong> — tool name, arguments, result</li>
        <li><strong className="text-white">TTS span</strong> — character count, provider, latency</li>
      </ul>

      {/* ── SECURITY ─────────────────────────────────────────────────────────── */}
      <DocHeading id="security">
        <Shield className="h-6 w-6 text-slate-400" />
        Security
      </DocHeading>
      <Table
        headers={['Feature', 'Implementation']}
        rows={[
          ['Authentication', 'Clerk RS256 JWT — validated server-side on every protected request'],
          ['Multi-tenancy', 'All DB queries filtered by org_id from the verified JWT claim'],
          ['Twilio webhook validation', 'TWILIO_AUTH_TOKEN validates X-Twilio-Signature on every inbound call'],
          ['Stripe webhook validation', 'STRIPE_WEBHOOK_SECRET validates Stripe-Signature on every billing event'],
          ['Billing gate', 'WebSocket upgrade refused with 402 if org has zero minutes'],
          ['Admin endpoint', 'Separate ADMIN_API_KEY header — never exposed to frontend'],
          ['Secrets', 'All credentials in environment variables — never hardcoded'],
          ['CORS', 'Restricted to DASHBOARD_URL (default: http://localhost:5173)'],
          ['Helmet', 'Security headers set on all API responses'],
        ]}
      />
      <Note type="warn">
        Change <DocCode>ADMIN_API_KEY</DocCode> from the default <DocCode>dev-admin-key-change-me</DocCode> before deploying to production.
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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="text-slate-300 hover:text-white hover:bg-slate-800">
              <Link to="/" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <div className="h-4 w-px bg-slate-700" />
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-blue-400" />
              <span className="font-semibold text-white">Velox AI</span>
              <ChevronRight className="h-4 w-4 text-slate-600" />
              <span className="text-slate-300">Documentation</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-blue-600/20 text-blue-300 border-blue-500/30 hover:bg-blue-600/30">
              v1.0
            </Badge>
            <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-500 text-white">
              <Link to="/agents">Open Dashboard</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto flex">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto border-r border-slate-800 py-6 px-3 hidden lg:block">
          <nav className="space-y-1">
            {sections.map((section) => (
              <div key={section.id}>
                <a
                  href={`#${section.id}`}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                    activeSection === section.id
                      ? 'bg-blue-600/20 text-blue-300'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
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
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 transition-colors"
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
        <main className="flex-1 min-w-0 px-8 py-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            {/* Page title */}
            <div className="mb-10">
              <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
                <BookOpen className="h-4 w-4" />
                <span>Velox AI Documentation</span>
              </div>
              <h1 className="text-4xl font-bold text-white mb-3">Platform Documentation</h1>
              <p className="text-lg text-slate-400">
                Everything you need to build, deploy, and scale AI voice agents with Velox AI.
              </p>
            </div>

            <DocContent />
          </motion.div>
        </main>

        {/* Right mini-nav (on-this-page) */}
        <div className="w-48 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto py-6 px-4 hidden xl:block">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">On this page</p>
          <nav className="space-y-1">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="block text-xs text-slate-500 hover:text-slate-300 py-1 transition-colors"
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
