// src/pages/Agents.tsx
// Redesigned with onboarding interview flow.
// Agent type selection + guided questions = auto-generated persona from company docs.

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
  PlayCircle,
  Pencil,
  X,
  Loader2,
  Mic2,
  FileText,
  Zap,
  ChevronLeft,
  Headphones,
  CalendarCheck,
  HelpCircle,
  Check,
  ArrowRight,
  FolderOpen,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Agent {
  id: string
  name: string
  phone_number: string | null
  voice_id: string
  system_prompt: string
  is_active: boolean
  org_id: string
  agent_type?: string
  _count?: { conversations: number }
}

// ── Agent Types ───────────────────────────────────────────────────────────────

const AGENT_TYPES = [
  {
    id: 'customer_support',
    label: 'Customer Support',
    description: 'Handle FAQs, order status, returns, and escalations',
    icon: Headphones,
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    questions: [
      { id: 'company_name', label: 'What is your company name?', placeholder: 'e.g. Acme Corporation' },
      { id: 'products', label: 'What products/services do customers ask about?', placeholder: 'e.g. Electronics, software subscriptions, shipping' },
      { id: 'escalation', label: 'When should the agent escalate to a human?', placeholder: 'e.g. Refunds over $100, complaints, technical issues' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales Outreach',
    description: 'Qualify leads, schedule demos, and follow up',
    icon: Zap,
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    questions: [
      { id: 'company_name', label: 'What is your company name?', placeholder: 'e.g. TechSolutions Inc' },
      { id: 'offering', label: 'What are you selling?', placeholder: 'e.g. SaaS platform, consulting services' },
      { id: 'pricing_url', label: 'Where can customers find pricing?', placeholder: 'e.g. example.com/pricing or "Contact us for a quote"' },
    ],
  },
  {
    id: 'appointment',
    label: 'Appointment Booking',
    description: 'Book, reschedule, and cancel appointments',
    icon: CalendarCheck,
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    questions: [
      { id: 'business_name', label: 'What is your business name?', placeholder: 'e.g. Downtown Dental Clinic' },
      { id: 'services', label: 'What services do you offer?', placeholder: 'e.g. Checkups, cleanings, cosmetic dentistry' },
      { id: 'hours', label: 'What are your operating hours?', placeholder: 'e.g. Mon-Fri 9am-5pm, Sat 10am-2pm' },
    ],
  },
  {
    id: 'it_helpdesk',
    label: 'IT Help Desk',
    description: 'Resolve tickets, reset passwords, guide users',
    icon: HelpCircle,
    color: 'bg-violet-100 text-violet-700 border-violet-200',
    questions: [
      { id: 'company_name', label: 'What is your company name?', placeholder: 'e.g. GlobalTech Corp' },
      { id: 'common_issues', label: 'What are common issues users face?', placeholder: 'e.g. Password resets, VPN issues, software installation' },
      { id: 'systems', label: 'What systems/tools do you support?', placeholder: 'e.g. Microsoft 365, Slack, Salesforce' },
    ],
  },
]

const VOICE_PRESETS = [
  { id: 'aura-asteria-en', label: 'Asteria', desc: 'Female, US' },
  { id: 'aura-luna-en', label: 'Luna', desc: 'Female, soft' },
  { id: 'aura-orion-en', label: 'Orion', desc: 'Male, US' },
  { id: 'aura-arcas-en', label: 'Arcas', desc: 'Male, deep' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function Agents() {
  const qc = useQueryClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<Agent | null>(null)

  // Onboarding wizard state
  const [step, setStep] = useState(1) // 1: Type, 2: Questions, 3: Voice & Name
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [agentName, setAgentName] = useState('')
  const [voiceId, setVoiceId] = useState('aura-asteria-en')
  const [phoneNumber, setPhoneNumber] = useState('')

  // Fetch agents
  const { data: agents = [], isLoading, isError } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: () =>
      api.get<{ agents: Agent[]; total: number }>('/api/agents').then((r) => r.data.agents ?? []),
  })

  // Create mutation
  const createMut = useMutation({
    mutationFn: (body: { name: string; voice_id: string; system_prompt: string; phone_number?: string; agent_type?: string }) =>
      api.post<Agent>('/api/agents', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] })
      toast.success('Agent created! Test it in the Playground.')
      closeDrawer()
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error ?? 'Failed to create agent')
    },
  })

  // Update mutation
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Agent> }) =>
      api.patch<Agent>(`/api/agents/${id}`, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] })
      toast.success('Agent updated')
      closeDrawer()
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error ?? 'Failed to update agent')
    },
  })

  function openCreate() {
    setEditing(null)
    setStep(1)
    setSelectedType(null)
    setAnswers({})
    setAgentName('')
    setVoiceId('aura-asteria-en')
    setPhoneNumber('')
    setDrawerOpen(true)
  }

  function openEdit(agent: Agent) {
    setEditing(agent)
    setAgentName(agent.name)
    setVoiceId(agent.voice_id)
    setPhoneNumber(agent.phone_number ?? '')
    setStep(3) // Jump to final step for editing
    setDrawerOpen(true)
  }

  function closeDrawer() {
    setDrawerOpen(false)
    setEditing(null)
  }

  function generateSystemPrompt(): string {
    const type = AGENT_TYPES.find((t) => t.id === selectedType)
    if (!type) return ''

    const a = answers
    switch (selectedType) {
      case 'customer_support':
        return `You are a friendly customer support agent for ${a.company_name || '[Company]'}.

Your responsibilities:
- Answer questions about ${a.products || 'products and services'}
- Help with order status, returns, and general inquiries
- Keep responses concise (under 3 sentences)
- Be empathetic and professional

When to escalate to a human:
${a.escalation || '- Complex issues\n- Angry customers\n- Requests outside your scope'}

Always greet callers warmly and confirm you've understood their question before answering.
If you don't have information, say "Let me connect you with a specialist who can help."`

      case 'sales':
        return `You are an enthusiastic sales agent for ${a.company_name || '[Company]'}.

What you're selling:
${a.offering || '[Products/Services]'}

Your goals:
- Understand the customer's needs through questions
- Highlight how your offerings solve their problems
- Be honest — never oversell or make promises you can't keep
- Guide interested customers toward next steps

Pricing information:
${a.pricing_url || 'Direct customers to speak with our team for pricing'}

Always be friendly, professional, and focused on helping — not pushing.`

      case 'appointment':
        return `You are a scheduling assistant for ${a.business_name || '[Business]'}.

Services offered:
${a.services || '[Services]'}

Operating hours:
${a.hours || '[Hours]'}

Your responsibilities:
- Help callers book new appointments
- Reschedule or cancel existing appointments
- Collect: name, contact info, preferred date/time, service type
- Always confirm details before finalizing

Be friendly and efficient. If a requested time isn't available, offer alternatives.`

      case 'it_helpdesk':
        return `You are an IT help desk assistant for ${a.company_name || '[Company]'}.

Common issues you handle:
${a.common_issues || '- Password resets\n- Software issues\n- Connectivity problems'}

Systems you support:
${a.systems || '[Systems/Tools]'}

Your approach:
- Ask clarifying questions to understand the issue
- Provide step-by-step guidance
- Be patient and clear — users may not be technical
- Escalate complex issues to the IT team

If you can't resolve something, create a ticket and let the user know someone will follow up.`

      default:
        return ''
    }
  }

  function handleCreate() {
    if (!agentName.trim()) {
      toast.error('Please enter an agent name')
      return
    }

    const systemPrompt = generateSystemPrompt()
    createMut.mutate({
      name: agentName,
      voice_id: voiceId,
      system_prompt: systemPrompt,
      phone_number: phoneNumber || undefined,
      agent_type: selectedType || undefined,
    })
  }

  function handleUpdate() {
    if (!editing) return
    updateMut.mutate({
      id: editing.id,
      body: {
        name: agentName,
        voice_id: voiceId,
        phone_number: phoneNumber || null,
      },
    })
  }

  const isSaving = createMut.isPending || updateMut.isPending
  const currentType = AGENT_TYPES.find((t) => t.id === selectedType)

  return (
    <>
      <div className="min-h-screen bg-[#faf9f7]">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-b border-stone-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10"
        >
          <div className="container mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bot className="h-6 w-6 text-amber-600" />
              <h1 className="text-xl font-semibold text-stone-900">Agents</h1>
              <Badge variant="secondary" className="text-xs">
                {agents.length} agent{agents.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <Button onClick={openCreate} className="bg-amber-600 hover:bg-amber-500 text-white">
              <Plus className="h-4 w-4 mr-2" />
              New Agent
            </Button>
          </div>
        </motion.header>

        <div className="container mx-auto px-6 py-8">
          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-24 text-stone-500">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading agents…
            </div>
          )}

          {/* Error */}
          {isError && !isLoading && (
            <div className="max-w-md mx-auto text-center py-16 space-y-3">
              <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                <X className="h-6 w-6 text-red-600" />
              </div>
              <p className="text-stone-900 font-medium">Failed to load agents</p>
              <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['agents'] })}>
                Retry
              </Button>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && agents.length === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-2xl mx-auto text-center py-16"
            >
              <div className="h-20 w-20 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-6">
                <Bot className="h-10 w-10 text-amber-600" />
              </div>
              <h2 className="text-2xl font-bold text-stone-900 mb-3">Create Your First AI Agent</h2>
              <p className="text-stone-600 mb-6 max-w-md mx-auto">
                Answer a few questions and we'll configure an AI voice agent trained on your company documents.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
                <Button onClick={openCreate} className="bg-amber-600 hover:bg-amber-500 text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Agent
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/knowledge">
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Upload Company Docs First
                  </Link>
                </Button>
              </div>

              <p className="text-sm text-stone-500">
                Tip: Upload your company policies, FAQs, and guidelines to Company Docs first.
                <br />
                Your agents will use these documents to answer questions accurately.
              </p>
            </motion.div>
          )}

          {/* Agent grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent, i) => {
              const type = AGENT_TYPES.find((t) => t.id === agent.agent_type)
              const TypeIcon = type?.icon || Bot
              return (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="h-full hover:shadow-lg transition-shadow bg-white border-stone-200">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${type?.color || 'bg-stone-100 text-stone-600'}`}>
                            <TypeIcon className="h-5 w-5" />
                          </div>
                          <div>
                            <CardTitle className="text-base text-stone-900">{agent.name}</CardTitle>
                            <CardDescription className="text-xs mt-0.5">
                              {type?.label || 'Custom Agent'}
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant={agent.is_active ? 'default' : 'outline'} className="text-xs">
                          {agent.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-3 text-xs text-stone-500">
                        <span className="flex items-center gap-1">
                          <Mic2 className="h-3 w-3" />
                          {agent.voice_id}
                        </span>
                        {agent.phone_number && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {agent.phone_number}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(agent)}>
                          <Pencil className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/agents/${agent.id}/playground`}>
                            <PlayCircle className="h-3 w-3 mr-1" />
                            Test
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* Onboarding Drawer */}
        <AnimatePresence>
          {drawerOpen && (
            <div className="fixed inset-0 z-50 flex justify-end">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/40"
                onClick={closeDrawer}
              />

              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-stone-200">
                  <div>
                    <h2 className="text-lg font-semibold text-stone-900">
                      {editing ? 'Edit Agent' : 'Create New Agent'}
                    </h2>
                    {!editing && (
                      <p className="text-sm text-stone-500 mt-0.5">Step {step} of 3</p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={closeDrawer}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Progress bar */}
                {!editing && (
                  <div className="px-6 py-3 border-b border-stone-100">
                    <div className="flex gap-2">
                      {[1, 2, 3].map((s) => (
                        <div
                          key={s}
                          className={`h-1.5 flex-1 rounded-full transition-colors ${
                            s <= step ? 'bg-amber-500' : 'bg-stone-200'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {/* Step 1: Select Type */}
                  {!editing && step === 1 && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-base font-medium text-stone-900 mb-1">What type of agent do you need?</h3>
                        <p className="text-sm text-stone-500">Select based on your primary use case</p>
                      </div>

                      <div className="grid gap-3">
                        {AGENT_TYPES.map((type) => {
                          const Icon = type.icon
                          const isSelected = selectedType === type.id
                          return (
                            <button
                              key={type.id}
                              type="button"
                              onClick={() => setSelectedType(type.id)}
                              className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                                isSelected
                                  ? 'border-amber-500 bg-amber-50'
                                  : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${type.color}`}>
                                  <Icon className="h-5 w-5" />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <p className="font-medium text-stone-900">{type.label}</p>
                                    {isSelected && <Check className="h-5 w-5 text-amber-600" />}
                                  </div>
                                  <p className="text-sm text-stone-500 mt-0.5">{type.description}</p>
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Step 2: Questions */}
                  {!editing && step === 2 && currentType && (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-base font-medium text-stone-900 mb-1">
                          Tell us about your {currentType.label.toLowerCase()}
                        </h3>
                        <p className="text-sm text-stone-500">
                          This helps us configure the agent's knowledge and behavior
                        </p>
                      </div>

                      {currentType.questions.map((q) => (
                        <div key={q.id} className="space-y-2">
                          <Label className="text-stone-700">{q.label}</Label>
                          <Textarea
                            value={answers[q.id] || ''}
                            onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                            placeholder={q.placeholder}
                            rows={3}
                          />
                        </div>
                      ))}

                      <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                        <div className="flex gap-3">
                          <FileText className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-amber-800">
                              Company documents enhance your agent
                            </p>
                            <p className="text-sm text-amber-700 mt-1">
                              Upload policies, FAQs, and guidelines to{' '}
                              <Link to="/knowledge" className="underline font-medium">
                                Company Docs
                              </Link>{' '}
                              — your agent will use them to answer questions.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Voice & Name (also used for editing) */}
                  {(step === 3 || editing) && (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-base font-medium text-stone-900 mb-1">
                          {editing ? 'Agent Settings' : 'Final details'}
                        </h3>
                        <p className="text-sm text-stone-500">
                          {editing ? 'Update your agent configuration' : 'Name your agent and select a voice'}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-stone-700">Agent Name</Label>
                        <Input
                          value={agentName}
                          onChange={(e) => setAgentName(e.target.value)}
                          placeholder="e.g. Support Agent, Sales Bot"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-stone-700">Voice</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {VOICE_PRESETS.map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => setVoiceId(v.id)}
                              className={`p-3 rounded-lg border-2 text-left transition-all ${
                                voiceId === v.id
                                  ? 'border-amber-500 bg-amber-50'
                                  : 'border-stone-200 hover:border-stone-300'
                              }`}
                            >
                              <p className="font-medium text-stone-900 text-sm">{v.label}</p>
                              <p className="text-xs text-stone-500">{v.desc}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-stone-700">Phone Number (optional)</Label>
                        <Input
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="+1 555 000 0000"
                        />
                        <p className="text-xs text-stone-500">
                          Leave blank to test in Playground first. Add later to go live.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="border-t border-stone-200 px-6 py-4 flex gap-3">
                  {!editing && step > 1 && (
                    <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Back
                    </Button>
                  )}

                  <div className="flex-1" />

                  {!editing && step === 1 && (
                    <Button
                      onClick={() => setStep(2)}
                      disabled={!selectedType}
                      className="bg-amber-600 hover:bg-amber-500 text-white"
                    >
                      Continue
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  )}

                  {!editing && step === 2 && (
                    <Button
                      onClick={() => setStep(3)}
                      className="bg-amber-600 hover:bg-amber-500 text-white"
                    >
                      Continue
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  )}

                  {!editing && step === 3 && (
                    <Button
                      onClick={handleCreate}
                      disabled={isSaving || !agentName.trim()}
                      className="bg-amber-600 hover:bg-amber-500 text-white"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Creating…
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Create Agent
                        </>
                      )}
                    </Button>
                  )}

                  {editing && (
                    <Button
                      onClick={handleUpdate}
                      disabled={isSaving || !agentName.trim()}
                      className="bg-amber-600 hover:bg-amber-500 text-white"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Saving…
                        </>
                      ) : (
                        'Save Changes'
                      )}
                    </Button>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
