// src/pages/Agents.tsx
// 5.5 — Agents list page: create / edit agents via a side drawer.
//        Uses TanStack Query for data fetching from GET /api/agents.
// UX  — Added step-by-step AgentTutorial, contextual help text, richer
//        placeholders, onboarding empty state, and ID anchors for spotlight.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Bot,
  Plus,
  Phone,
  Workflow,
  PlayCircle,
  Pencil,
  X,
  Loader2,
  Mic2,
  FileText,
  Zap,
  MessageSquare,
  ChevronRight,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { AgentTutorial, AgentTutorialTrigger } from '@/components/agents/AgentTutorial'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Agent {
  id: string
  name: string
  phone_number: string | null
  voice_id: string
  system_prompt: string
  is_active: boolean
  org_id: string
  _count?: { conversations: number }
}

interface AgentForm {
  name: string
  phone_number: string
  voice_id: string
  system_prompt: string
}

const DEFAULT_FORM: AgentForm = {
  name: '',
  phone_number: '',
  voice_id: 'aura-asteria-en',
  system_prompt: '',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Small inline help bubble shown next to a label */
function FieldHelp({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block ml-1 align-middle">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-slate-500 hover:text-slate-300 transition-colors"
        aria-label="Help"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 w-56 bg-slate-800 border border-slate-700 rounded-lg p-2.5 shadow-xl pointer-events-none"
          >
            <p className="text-xs text-slate-300 leading-relaxed">{text}</p>
            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-700" />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}

// ── Voice presets ─────────────────────────────────────────────────────────────

const VOICE_PRESETS = [
  { id: 'aura-asteria-en', label: 'Asteria (female, US)' },
  { id: 'aura-luna-en',    label: 'Luna (female, soft)' },
  { id: 'aura-orion-en',   label: 'Orion (male, US)' },
  { id: 'aura-arcas-en',   label: 'Arcas (male, deep)' },
]

// ── System prompt starters ────────────────────────────────────────────────────

const PROMPT_STARTERS = [
  {
    label: 'Customer Support',
    icon: MessageSquare,
    prompt:
      'You are a friendly customer support agent for [Company]. Your job is to help customers with questions about orders, returns, and product information. Keep answers concise (under 3 sentences). If you cannot help, say "Let me transfer you to a specialist."',
  },
  {
    label: 'Sales Agent',
    icon: Zap,
    prompt:
      'You are an enthusiastic sales agent for [Company]. Your goal is to understand the customer\'s needs, highlight matching products, and guide them toward a purchase. Always be honest — never oversell. If asked about pricing, direct them to [URL].',
  },
  {
    label: 'Appointment Booking',
    icon: Phone,
    prompt:
      'You are a scheduling assistant for [Business]. Help callers book, reschedule, or cancel appointments. Collect their name, preferred date/time, and service type. Always confirm details before saving.',
  },
  {
    label: 'FAQ Bot',
    icon: FileText,
    prompt:
      'You are a knowledgeable FAQ assistant. Answer questions using only the information in the knowledge base. If the answer is not in the knowledge base, say "I don\'t have that information — can I connect you with a team member?"',
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function Agents() {
  const qc = useQueryClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<Agent | null>(null)
  const [form, setForm] = useState<AgentForm>(DEFAULT_FORM)
  const [showTutorial, setShowTutorial] = useState(false)
  // Track whether drawer has fully animated open so tutorial knows DOM is ready
  const [drawerReady, setDrawerReady] = useState(false)

  // Fetch agents — backend returns { agents: Agent[], total: number }
  const { data: agents = [], isLoading, isError } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: () =>
      api
        .get<{ agents: Agent[]; total: number }>('/api/agents')
        .then((r) => r.data.agents ?? []),
  })

  // Create mutation
  const createMut = useMutation({
    mutationFn: (body: AgentForm) =>
      api.post<Agent>('/api/agents', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] })
      toast.success('🎉 Agent created successfully!')
      closeDrawer()
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? 'Failed to create agent'
      toast.error(msg)
    },
  })

  // Update mutation
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<AgentForm> }) =>
      api.patch<Agent>(`/api/agents/${id}`, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] })
      toast.success('Agent updated successfully')
      closeDrawer()
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? 'Failed to update agent'
      toast.error(msg)
    },
  })

  function openCreate() {
    setEditing(null)
    setForm(DEFAULT_FORM)
    setDrawerReady(false)
    setDrawerOpen(true)
  }

  function openEdit(agent: Agent) {
    setEditing(agent)
    setForm({
      name: agent.name,
      phone_number: agent.phone_number ?? '',
      voice_id: agent.voice_id,
      system_prompt: agent.system_prompt,
    })
    setDrawerReady(false)
    setDrawerOpen(true)
  }

  function closeDrawer() {
    setDrawerOpen(false)
    setDrawerReady(false)
    setEditing(null)
    setForm(DEFAULT_FORM)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Agent name is required'); return }
    if (!form.system_prompt.trim()) { toast.error('System prompt is required'); return }
    if (editing) {
      updateMut.mutate({ id: editing.id, body: form })
    } else {
      createMut.mutate(form)
    }
  }

  const isSaving = createMut.isPending || updateMut.isPending

  return (
    <>
      {/* ── Tutorial overlay ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showTutorial && (
          <AgentTutorial
            drawerOpen={drawerOpen}
            drawerReady={drawerReady}
            onComplete={() => {
              setShowTutorial(false)
              localStorage.setItem('agents_tutorial_done', 'true')
              toast.success('Tutorial complete! Create your first agent 🎉')
            }}
            onSkip={() => {
              setShowTutorial(false)
              localStorage.setItem('agents_tutorial_done', 'true')
            }}
          />
        )}
      </AnimatePresence>

      <div className="min-h-screen bg-slate-950">
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <motion.header
          id="agents-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-b border-slate-800 bg-slate-950/95 backdrop-blur sticky top-0 z-10"
        >
          <div className="container mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bot className="h-6 w-6 text-blue-400" />
              <h1 className="text-xl font-semibold text-white">Agents</h1>
              <Badge variant="outline" className="border-slate-700 text-slate-400 text-xs">
                {agents.length} agent{agents.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <AgentTutorialTrigger onClick={() => setShowTutorial(true)} />
              <Button
                id="new-agent-btn"
                size="sm"
                onClick={openCreate}
                className="bg-blue-600 hover:bg-blue-500 text-white"
              >
                <Plus className="h-4 w-4 mr-1" />
                New Agent
              </Button>
            </div>
          </div>
        </motion.header>

        <div className="container mx-auto px-6 py-8">
          {/* ── Loading ──────────────────────────────────────────────────────── */}
          {isLoading && (
            <div className="flex items-center justify-center py-24 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading agents…
            </div>
          )}

          {/* ── Error state ──────────────────────────────────────────────────── */}
          {isError && !isLoading && (
            <div className="max-w-md mx-auto text-center py-16 space-y-3">
              <div className="h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
                <X className="h-6 w-6 text-red-400" />
              </div>
              <p className="text-white font-medium">Failed to load agents</p>
              <p className="text-sm text-slate-500">Check your connection and API key, then try refreshing.</p>
              <Button
                variant="outline"
                size="sm"
                className="border-slate-700 text-slate-300 hover:text-white"
                onClick={() => qc.invalidateQueries({ queryKey: ['agents'] })}
              >
                Retry
              </Button>
            </div>
          )}

          {/* ── Onboarding empty state ───────────────────────────────────────── */}
          {!isLoading && agents.length === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-2xl mx-auto text-center py-16"
            >
              <div className="relative w-20 h-20 mx-auto mb-6">
                <div className="absolute inset-0 rounded-2xl bg-blue-500/20 animate-pulse" />
                <div className="relative h-20 w-20 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                  <Bot className="h-10 w-10 text-blue-400" />
                </div>
              </div>

              <h2 className="text-2xl font-bold text-white mb-3">
                Create Your First AI Agent
              </h2>
              <p className="text-slate-400 mb-8 leading-relaxed max-w-md mx-auto">
                Agents are voice-powered AIs that answer calls, look up information, and take
                actions — 24/7, without a human team. Set one up in under 2 minutes.
              </p>

              {/* 3-step mini guide */}
              <div className="grid grid-cols-3 gap-4 mb-8 text-left">
                {[
                  { n: '1', icon: FileText,    label: 'Write a prompt', desc: 'Tell the agent who it is and how to behave.' },
                  { n: '2', icon: Mic2,        label: 'Pick a voice',   desc: 'Choose from Deepgram Aura or ElevenLabs.' },
                  { n: '3', icon: PlayCircle,  label: 'Test & deploy',  desc: 'Try it in the Playground, then assign a phone number.' },
                ].map(({ n, icon: Icon, label, desc }) => (
                  <div
                    key={n}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-6 w-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                        {n}
                      </span>
                      <Icon className="h-4 w-4 text-slate-400" />
                    </div>
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={openCreate}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Agent
                </Button>
                <Button
                  variant="outline"
                  className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
                  onClick={() => setShowTutorial(true)}
                >
                  <ChevronRight className="h-4 w-4 mr-1" />
                  Take a Tour First
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── Agent cards grid ─────────────────────────────────────────────── */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent, i) => (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card
                  id={i === 0 ? 'agent-card-0' : undefined}
                  className="h-full hover:shadow-lg hover:shadow-blue-900/10 transition-all duration-200 bg-slate-900 border-slate-800 hover:border-slate-700"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center ring-1 ring-blue-500/20">
                          <Bot className="h-5 w-5 text-blue-400" />
                        </div>
                        <div>
                          <CardTitle className="text-base text-white">{agent.name}</CardTitle>
                          <CardDescription className="text-xs flex items-center gap-1 mt-0.5 text-slate-500">
                            <Phone className="h-3 w-3" />
                            {agent.phone_number || <span className="italic">No phone assigned</span>}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge
                        variant={agent.is_active ? 'default' : 'outline'}
                        className={agent.is_active
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs'
                          : 'border-slate-700 text-slate-500 text-xs'}
                      >
                        {agent.is_active ? '● Active' : '○ Inactive'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">
                      {agent.system_prompt || (
                        <span className="italic text-slate-600">No system prompt set</span>
                      )}
                    </p>

                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Mic2 className="h-3 w-3" />
                        {agent.voice_id}
                      </span>
                      {agent._count !== undefined && (
                        <>
                          <span>·</span>
                          <span>
                            {agent._count.conversations} call
                            {agent._count.conversations !== 1 ? 's' : ''}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button
                        id={i === 0 ? 'agent-edit-btn-0' : undefined}
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(agent)}
                        className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        id={i === 0 ? 'agent-flow-btn-0' : undefined}
                        variant="outline"
                        size="sm"
                        asChild
                        className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
                      >
                        <Link to={`/agents/${agent.id}/flow`}>
                          <Workflow className="h-3 w-3 mr-1" />
                          Flow
                        </Link>
                      </Button>
                      <Button
                        id={i === 0 ? 'agent-test-btn-0' : undefined}
                        variant="outline"
                        size="sm"
                        asChild
                        className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
                      >
                        <Link to={`/agents/${agent.id}/playground`}>
                          <PlayCircle className="h-3 w-3 mr-1" />
                          Test
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── Side Drawer ──────────────────────────────────────────────────────── */}
        <AnimatePresence>
          {drawerOpen && (
            <div className="fixed inset-0 z-50 flex justify-end">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={closeDrawer}
              />

              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                onAnimationComplete={() => setDrawerReady(true)}
                className="relative w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col text-slate-100"
              >
                {/* Drawer Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-blue-400" />
                    </div>
                    <h2 className="text-base font-semibold text-white">
                      {editing ? 'Edit Agent' : 'New Agent'}
                    </h2>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={closeDrawer}
                    className="text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                  <div className="p-6 space-y-6">

                    {/* Agent Name */}
                    <div id="field-name" className="space-y-1.5">
                      <Label htmlFor="name" className="text-slate-300 flex items-center">
                        Agent Name <span className="text-red-400 ml-0.5">*</span>
                        <FieldHelp text="A clear internal name. Used in dashboards, logs, and analytics. E.g. 'US Sales Bot' or 'EN Support'." />
                      </Label>
                      <Input
                        id="name"
                        required
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="e.g. US Support Agent, Sales Bot, Appointment Scheduler"
                        className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500"
                      />
                    </div>

                    {/* Phone Number */}
                    <div id="field-phone" className="space-y-1.5">
                      <Label htmlFor="phone" className="text-slate-300 flex items-center">
                        Phone Number
                        <FieldHelp text="The Twilio number to assign. Callers who dial this number will be routed to this agent. Buy numbers at console.twilio.com first." />
                      </Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <Input
                          id="phone"
                          value={form.phone_number}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, phone_number: e.target.value }))
                          }
                          placeholder="+1 555 000 0000"
                          className="pl-9 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500"
                        />
                      </div>
                      <p className="text-xs text-slate-500">
                        Leave blank to test in the Playground without going live.
                      </p>
                    </div>

                    {/* Voice */}
                    <div id="field-voice" className="space-y-1.5">
                      <Label htmlFor="voice" className="text-slate-300 flex items-center">
                        Voice
                        <FieldHelp text="Controls how the agent sounds. Use Deepgram Aura voices for low latency, or prefix with 'el_' to use an ElevenLabs voice ID." />
                      </Label>

                      {/* Quick presets */}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {VOICE_PRESETS.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, voice_id: v.id }))}
                            className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                              form.voice_id === v.id
                                ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                                : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                            }`}
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>

                      <div className="relative">
                        <Mic2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <Input
                          id="voice"
                          value={form.voice_id}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, voice_id: e.target.value }))
                          }
                          placeholder="aura-asteria-en  or  el_XXXXXXXX for ElevenLabs"
                          className="pl-9 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 font-mono text-sm"
                        />
                      </div>
                    </div>

                    {/* System Prompt */}
                    <div id="field-prompt" className="space-y-1.5">
                      <Label htmlFor="prompt" className="text-slate-300 flex items-center">
                        System Prompt <span className="text-red-400 ml-0.5">*</span>
                        <FieldHelp text="The agent's personality and instructions. Be specific: who it is, how it speaks, what it must/must not do, and when to escalate to a human." />
                      </Label>

                      {/* Starter templates — shown only when prompt is empty */}
                      {!form.system_prompt && (
                        <div className="space-y-1.5">
                          <p className="text-xs text-slate-500">Start from a template:</p>
                          <div className="grid grid-cols-2 gap-2">
                            {PROMPT_STARTERS.map((s) => {
                              const Icon = s.icon
                              return (
                                <button
                                  key={s.label}
                                  type="button"
                                  onClick={() =>
                                    setForm((f) => ({ ...f, system_prompt: s.prompt }))
                                  }
                                  className="text-left p-2.5 rounded-lg border border-slate-700 hover:border-blue-500/50 hover:bg-slate-800 transition-all group"
                                >
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <Icon className="h-3 w-3 text-slate-400 group-hover:text-blue-400" />
                                    <span className="text-xs font-medium text-slate-300">
                                      {s.label}
                                    </span>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      <Textarea
                        id="prompt"
                        required
                        rows={8}
                        value={form.system_prompt}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, system_prompt: e.target.value }))
                        }
                        placeholder={
                          'You are a helpful support agent for Acme Corp.\n\n' +
                          '- Greet callers: "Hi, thanks for calling Acme! How can I help?"\n' +
                          '- Answer questions about orders, returns, and product info.\n' +
                          '- Keep answers under 3 sentences.\n' +
                          '- If you cannot help, say "Let me connect you with a specialist."'
                        }
                        className="resize-none bg-slate-800 border-slate-700 text-white placeholder:text-slate-600 focus:border-blue-500 font-mono text-sm leading-relaxed"
                      />
                      <div className="flex justify-between text-xs text-slate-600">
                        <span>Replace [placeholders] with your actual values</span>
                        <span>{form.system_prompt.length} chars</span>
                      </div>
                    </div>
                  </div>

                  {/* Sticky footer */}
                  <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 px-6 py-4">
                    <Button
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white"
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Saving…
                        </>
                      ) : editing ? (
                        'Save Changes'
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-2" />
                          Create Agent
                        </>
                      )}
                    </Button>
                    {!editing && (
                      <p className="text-xs text-slate-500 text-center mt-2">
                        You can test your agent in the Playground before assigning a phone number.
                      </p>
                    )}
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
