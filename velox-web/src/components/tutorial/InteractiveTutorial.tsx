// src/components/tutorial/InteractiveTutorial.tsx
// Full interactive onboarding wizard that guides the user through:
//  Step 1 — Welcome & overview
//  Step 2 — Create a demo agent (pre-fills the form, user sees the values)
//  Step 3 — Agent saved confirmation
//  Step 4 — Explore the Playground (links to demo agent playground)
//  Step 5 — Build a demo Flow (links to flow page)
//  Step 6 — Set up Company Policy (links to policy page)
//  Step 7 — Done 🎉
//
// The demo agent is persisted to localStorage via demoAgent.ts helpers.
// Each step has a real "Do it" action button that performs the operation.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Bot,
  Play,
  GitBranch,
  Shield,
  CheckCircle2,
  Loader2,
  Zap,
  ArrowRight,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  DEFAULT_DEMO_AGENT,
  DemoAgent,
  loadDemoAgent,
  saveDemoAgent,
  DEMO_AGENT_ID,
} from '@/lib/demoAgent'

// ── Types ──────────────────────────────────────────────────────────────────────

interface TutorialStep {
  id: string
  title: string
  subtitle: string
  icon: React.ElementType
  iconColor: string
  iconBg: string
}

const STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Velox AI',
    subtitle: 'Let\'s set up your first AI voice agent in under 5 minutes.',
    icon: Zap,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/20',
  },
  {
    id: 'create-agent',
    title: 'Create Your Demo Agent',
    subtitle: 'We\'ve pre-filled a sample agent. Customise it or just click Save.',
    icon: Bot,
    iconColor: 'text-violet-400',
    iconBg: 'bg-violet-500/20',
  },
  {
    id: 'agent-saved',
    title: 'Agent Saved!',
    subtitle: 'Your demo agent is ready. Next: test it in the Playground.',
    icon: CheckCircle2,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/20',
  },
  {
    id: 'playground',
    title: 'Test in the Playground',
    subtitle: 'Chat with your agent in a safe sandbox — no real calls made.',
    icon: Play,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/20',
  },
  {
    id: 'flow',
    title: 'Build a Conversation Flow',
    subtitle: 'Use the visual Flow Builder to design branching conversation logic.',
    icon: GitBranch,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/20',
  },
  {
    id: 'policy',
    title: 'Set Up Company Policy',
    subtitle: 'Define brand voice, escalation rules, and compliance guidelines.',
    icon: Shield,
    iconColor: 'text-violet-400',
    iconBg: 'bg-violet-500/20',
  },
  {
    id: 'done',
    title: 'You\'re All Set! 🚀',
    subtitle: 'Your Velox AI workspace is ready. Go build something great.',
    icon: Sparkles,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/20',
  },
]

// ── Props ──────────────────────────────────────────────────────────────────────

interface InteractiveTutorialProps {
  onClose: () => void
}

// ── Component ──────────────────────────────────────────────────────────────────

export function InteractiveTutorial({ onClose }: InteractiveTutorialProps) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [agentSaved, setAgentSaved] = useState(() => loadDemoAgent() !== null)

  // Demo agent form state (pre-filled)
  const existing = loadDemoAgent()
  const [demoForm, setDemoForm] = useState<DemoAgent>(existing ?? DEFAULT_DEMO_AGENT)

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  // ── Actions ──────────────────────────────────────────────────────────────────

  function handleSaveAgent() {
    if (!demoForm.name.trim()) { toast.error('Agent name is required'); return }
    if (!demoForm.system_prompt.trim()) { toast.error('System prompt is required'); return }
    setSaving(true)
    setTimeout(() => {
      saveDemoAgent({ ...demoForm, id: DEMO_AGENT_ID, _isDemo: true })
      setAgentSaved(true)
      setSaving(false)
      toast.success('Demo agent saved!')
      setStep(2) // jump to confirmation step
    }, 600)
  }

  function handleGoToPlayground() {
    onClose()
    navigate(`/agents/${DEMO_AGENT_ID}/playground`)
  }

  function handleGoToFlow() {
    onClose()
    navigate('/flow')
  }

  function handleGoToPolicy() {
    onClose()
    navigate('/policy')
  }

  function handleFinish() {
    localStorage.setItem('velox_tutorial_done', 'true')
    onClose()
    toast.success('Tutorial complete — happy building! 🎉')
  }

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1)
    else handleFinish()
  }
  const prev = () => step > 0 && setStep((s) => s - 1)

  // ── Step content ──────────────────────────────────────────────────────────────

  function StepContent() {
    switch (current.id) {
      case 'welcome':
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-300 leading-relaxed">
              Velox AI lets you build, deploy, and monitor AI voice agents that handle real phone calls.
              This tutorial will walk you through the core workflow in 5 quick steps.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Bot,      label: 'Create Agent',  desc: 'Configure a voice AI' },
                { icon: Play,     label: 'Test It',       desc: 'Chat in the Playground' },
                { icon: GitBranch,label: 'Build Flow',    desc: 'Visual conversation logic' },
                { icon: Shield,   label: 'Set Policy',   desc: 'Brand & compliance rules' },
              ].map(({ icon: Icon, label, desc }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 bg-slate-800/60 rounded-xl p-3 border border-slate-700"
                >
                  <Icon className="h-4 w-4 text-blue-400 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-white">{label}</p>
                    <p className="text-xs text-slate-500">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Everything created in this tutorial is stored locally and won't affect your live agents.
            </p>
          </div>
        )

      case 'create-agent':
        return (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              We've pre-filled a demo agent below. Edit any field, then click <strong className="text-white">Save Demo Agent</strong>.
            </p>

            {/* Agent Name */}
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">Agent Name <span className="text-red-400">*</span></Label>
              <Input
                value={demoForm.name}
                onChange={(e) => setDemoForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Demo Support Agent"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 h-9 text-sm"
              />
            </div>

            {/* Voice */}
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">Voice</Label>
              <div className="flex flex-wrap gap-1.5">
                {['aura-asteria-en', 'aura-luna-en', 'aura-orion-en', 'aura-arcas-en'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setDemoForm((f) => ({ ...f, voice_id: v }))}
                    className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                      demoForm.voice_id === v
                        ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                        : 'border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    {v.replace('aura-', '').replace('-en', '')}
                  </button>
                ))}
              </div>
            </div>

            {/* System Prompt */}
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">System Prompt <span className="text-red-400">*</span></Label>
              <Textarea
                rows={4}
                value={demoForm.system_prompt}
                onChange={(e) => setDemoForm((f) => ({ ...f, system_prompt: e.target.value }))}
                placeholder="You are a helpful assistant for…"
                className="resize-none bg-slate-800 border-slate-700 text-white placeholder:text-slate-600 focus:border-blue-500 text-xs leading-relaxed"
              />
              <p className="text-xs text-slate-600">{demoForm.system_prompt.length} chars</p>
            </div>

            <Button
              onClick={handleSaveAgent}
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Bot className="h-4 w-4 mr-2" />
              )}
              {saving ? 'Saving…' : 'Save Demo Agent'}
            </Button>
          </div>
        )

      case 'agent-saved':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">"{demoForm.name}" saved!</p>
                <p className="text-xs text-slate-400">Voice: {demoForm.voice_id}</p>
              </div>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              Your demo agent is stored locally and ready to test. In the next step,
              you'll open the Playground to chat with it.
            </p>
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700 space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">System Prompt Preview</p>
              <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed">{demoForm.system_prompt}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep(1)}
              className="w-full border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
            >
              <Bot className="h-3.5 w-3.5 mr-2" />
              Edit Agent Again
            </Button>
          </div>
        )

      case 'playground':
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-300 leading-relaxed">
              The Playground lets you chat with your agent exactly as a caller would — no real calls, no cost. Try asking it a question.
            </p>
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700 space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Try these prompts</p>
              <div className="space-y-1.5">
                {[
                  'Hello, what can you help me with?',
                  'Tell me about your capabilities',
                  'What happens if I need a human?',
                ].map((prompt) => (
                  <div
                    key={prompt}
                    className="flex items-center gap-2 text-xs text-slate-400"
                  >
                    <ArrowRight className="h-3 w-3 text-blue-400 shrink-0" />
                    <span className="italic">"{prompt}"</span>
                  </div>
                ))}
              </div>
            </div>
            <Button
              onClick={handleGoToPlayground}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white"
            >
              <Play className="h-4 w-4 mr-2" />
              Open Playground →
            </Button>
            <p className="text-xs text-slate-500 text-center">
              The tutorial will continue when you come back.
            </p>
          </div>
        )

      case 'flow':
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-300 leading-relaxed">
              The Flow Builder is a drag-and-drop canvas where you define conversation logic — branches, conditions, handoffs, and more.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Start',     color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
                { label: 'Prompt',    color: 'bg-blue-500/20 text-blue-300 border-blue-500/30'    },
                { label: 'Condition', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
                { label: 'Tool',      color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
                { label: 'Handoff',   color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
                { label: 'End',       color: 'bg-red-500/20 text-red-300 border-red-500/30'       },
              ].map(({ label, color }) => (
                <div
                  key={label}
                  className={`text-xs font-medium px-2 py-1.5 rounded-lg border text-center ${color}`}
                >
                  {label}
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              A starter "Flow 1" with a Start node will be created automatically when you open the canvas.
            </p>
            <Button
              onClick={handleGoToFlow}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white"
            >
              <GitBranch className="h-4 w-4 mr-2" />
              Open Flow Builder →
            </Button>
          </div>
        )

      case 'policy':
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-300 leading-relaxed">
              Company Policy lets you define the rules your agents must follow — tone, privacy limits, escalation triggers, and compliance requirements.
            </p>
            <div className="space-y-2">
              {[
                { label: 'Brand Voice',      desc: 'Tone, greeting, forbidden phrases' },
                { label: 'Escalation Rules', desc: 'When to hand off to a human' },
                { label: 'Data & Privacy',   desc: 'What agents may/may not collect' },
                { label: 'Compliance',       desc: 'GDPR, CCPA, recordings' },
              ].map(({ label, desc }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 bg-slate-800/60 rounded-lg px-3 py-2 border border-slate-700"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-white">{label}</p>
                    <p className="text-xs text-slate-500">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button
              onClick={handleGoToPolicy}
              className="w-full bg-violet-600 hover:bg-violet-500 text-white"
            >
              <Shield className="h-4 w-4 mr-2" />
              Open Company Policy →
            </Button>
          </div>
        )

      case 'done':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Bot,       label: 'Demo Agent Created', done: agentSaved },
                { icon: Play,      label: 'Playground Ready',   done: true },
                { icon: GitBranch, label: 'Flow Builder Ready', done: true },
                { icon: Shield,    label: 'Policy Page Ready',  done: true },
              ].map(({ icon: Icon, label, done }) => (
                <div
                  key={label}
                  className={`flex items-center gap-2 rounded-xl p-3 border ${
                    done
                      ? 'bg-emerald-500/10 border-emerald-500/20'
                      : 'bg-slate-800/60 border-slate-700'
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Icon className="h-4 w-4 text-slate-500 shrink-0" />
                  )}
                  <p className={`text-xs font-medium ${done ? 'text-white' : 'text-slate-500'}`}>
                    {label}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              You're ready to go live. Assign a Twilio phone number to your agent and it'll start handling real calls 24/7.
            </p>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
              <p className="text-xs text-blue-300 leading-relaxed">
                <strong>Next step:</strong> Go to <strong>Agents</strong> → Edit your agent → add a Twilio phone number to deploy it live.
              </p>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93, y: 10 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Top accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-violet-500 to-emerald-500" />

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl ${current.iconBg} flex items-center justify-center shrink-0`}>
              <current.icon className={`h-5 w-5 ${current.iconColor}`} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white leading-tight">{current.title}</h2>
              <p className="text-xs text-slate-400 mt-0.5 leading-snug">{current.subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded shrink-0"
            aria-label="Close tutorial"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step content */}
        <div className="px-6 pb-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.18 }}
            >
              <StepContent />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Progress + navigation */}
        <div className="px-6 pb-5 space-y-3">
          {/* Progress dots */}
          <div className="flex gap-1.5 justify-center">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`rounded-full transition-all duration-300 ${
                  i === step
                    ? 'w-6 h-1.5 bg-blue-500'
                    : i < step
                    ? 'w-1.5 h-1.5 bg-blue-500/50'
                    : 'w-1.5 h-1.5 bg-slate-700'
                }`}
              />
            ))}
          </div>

          {/* Nav buttons */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-600">
              {step + 1} of {STEPS.length}
            </span>
            <div className="flex gap-2">
              {step > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={prev}
                  className="h-8 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                  Back
                </Button>
              )}
              {/* Skip create-agent step if already done */}
              {current.id === 'create-agent' ? (
                agentSaved ? (
                  <Button
                    size="sm"
                    onClick={next}
                    className="h-8 bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                ) : null
              ) : (
                <Button
                  size="sm"
                  onClick={isLast ? handleFinish : next}
                  className="h-8 bg-blue-600 hover:bg-blue-500 text-white"
                >
                  {isLast ? (
                    <>
                      Finish
                      <Sparkles className="h-3.5 w-3.5 ml-1" />
                    </>
                  ) : (
                    <>
                      Next
                      <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
