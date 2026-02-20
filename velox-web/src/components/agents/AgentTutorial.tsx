// src/components/agents/AgentTutorial.tsx
// Step-by-step guided tour for the Agents page.
// Highlights each UI region with a spotlight, animated arrow, and descriptive tooltip card.
//
// TIMING FIX: Steps that target elements inside the right-side drawer now wait
// for `drawerReady` (fired by onAnimationComplete on the drawer motion.div)
// before they measure target element positions. This prevents the spotlight from
// showing before the drawer is visible on screen.

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  X,
  ChevronRight,
  ChevronLeft,
  Bot,
  Phone,
  Mic2,
  FileText,
  Play,
  Workflow,
  Pencil,
  Sparkles,
  HelpCircle,
} from 'lucide-react'

// ── Step definitions ────────────────────────────────────────────────────────────

interface AgentTutorialStep {
  id: string
  title: string
  description: string
  hint?: string          // extra "pro tip" line
  icon: React.ElementType
  target: string         // DOM element ID to spotlight
  position: 'top' | 'bottom' | 'left' | 'right' | 'center'
  accentColor: string    // tailwind bg colour token for the icon bubble
  requiresDrawer?: boolean  // true = element lives inside the right-side drawer
  requiresAgent?: boolean   // true = element only exists when ≥1 agent card is present
}

const STEPS: AgentTutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Agents 🤖',
    description:
      'Agents are the heart of Velox AI. Each agent is a configurable voice AI that can answer calls, look up information, and take actions on behalf of your business.',
    hint: 'Think of an agent as a trained employee — you give it instructions, a voice, and tools, then assign it a phone number.',
    icon: Bot,
    target: 'agents-header',
    position: 'bottom',
    accentColor: 'bg-blue-500/20',
  },
  {
    id: 'new-agent-btn',
    title: 'Create Your First Agent',
    description:
      'Click "New Agent" to open the creation drawer. You\'ll set the agent\'s name, voice, phone number, and its core personality through a system prompt.',
    hint: 'You can create as many agents as your plan allows — for example, one for Sales and another for Support.',
    icon: Bot,
    target: 'new-agent-btn',
    position: 'bottom',
    accentColor: 'bg-blue-500/20',
  },
  {
    id: 'agent-name',
    title: 'Agent Name',
    description:
      'Give your agent a clear, descriptive name. This appears in the dashboard, call logs, and analytics — so "US Sales Bot" is better than "Agent 1".',
    hint: 'Names can be changed anytime without affecting live calls.',
    icon: Bot,
    target: 'field-name',
    position: 'right',
    accentColor: 'bg-violet-500/20',
    requiresDrawer: true,
  },
  {
    id: 'phone-number',
    title: 'Phone Number',
    description:
      'Assign a Twilio phone number to this agent. When someone dials that number, Velox routes the call directly to this agent.',
    hint: 'Format: +1 555 000 0000. Purchase numbers from the Twilio console first, then paste them here.',
    icon: Phone,
    target: 'field-phone',
    position: 'right',
    accentColor: 'bg-emerald-500/20',
    requiresDrawer: true,
  },
  {
    id: 'voice-id',
    title: 'Choose a Voice',
    description:
      'The Voice ID controls how your agent sounds. Use Deepgram Aura voices (e.g. aura-asteria-en) or ElevenLabs voices by prefixing with "el_" (e.g. el_XyzAbc).',
    hint: 'ElevenLabs voices are richer but cost slightly more per minute. Aura voices have lower latency.',
    icon: Mic2,
    target: 'field-voice',
    position: 'right',
    accentColor: 'bg-amber-500/20',
    requiresDrawer: true,
  },
  {
    id: 'system-prompt',
    title: 'System Prompt — The Agent\'s Brain',
    description:
      'This is the most important field. It defines who your agent is, how it speaks, what it knows, and what it can or cannot do. Be specific.',
    hint: 'Example: "You are a friendly support agent for Acme Corp. Always introduce yourself as Alex. Never share internal pricing. Keep answers under 2 sentences."',
    icon: FileText,
    target: 'field-prompt',
    position: 'right',
    accentColor: 'bg-rose-500/20',
    requiresDrawer: true,
  },
  {
    id: 'agent-card',
    title: 'Your Agent Card',
    description:
      'Each agent appears as a card showing its status, voice, phone number, and total call count. Active agents are live and will answer calls immediately.',
    icon: Bot,
    target: 'agent-card-0',
    position: 'bottom',
    accentColor: 'bg-slate-500/20',
    requiresAgent: true,
  },
  {
    id: 'flow-btn',
    title: 'Flow Builder',
    description:
      'The Flow button opens a visual drag-and-drop editor where you can design complex conversation trees — branching logic, handoffs, and condition checks.',
    hint: 'Use the flow builder when your agent needs to follow structured scripts or decision trees.',
    icon: Workflow,
    target: 'agent-flow-btn-0',
    position: 'top',
    accentColor: 'bg-violet-500/20',
    requiresAgent: true,
  },
  {
    id: 'test-btn',
    title: 'Test in Playground',
    description:
      'The Test button launches the Playground — a live chat interface where you can talk to your agent exactly as a caller would, without making a real phone call.',
    hint: 'Always test your agent in the Playground before assigning a live phone number.',
    icon: Play,
    target: 'agent-test-btn-0',
    position: 'top',
    accentColor: 'bg-emerald-500/20',
    requiresAgent: true,
  },
  {
    id: 'edit-btn',
    title: 'Edit Anytime',
    description:
      'Click Edit to update any field — name, voice, phone number, or system prompt. Changes take effect on the next incoming call, so existing active calls are not interrupted.',
    icon: Pencil,
    target: 'agent-edit-btn-0',
    position: 'top',
    accentColor: 'bg-amber-500/20',
    requiresAgent: true,
  },
  {
    id: 'done',
    title: 'You\'re All Set! 🚀',
    description:
      'Create your first agent, test it in the Playground, then assign a phone number to go live. Your AI voice agent will be ready to handle calls 24/7.',
    hint: 'Next step: click "New Agent" and give it a try!',
    icon: Sparkles,
    target: 'agents-header',
    position: 'center',
    accentColor: 'bg-blue-500/20',
  },
]

// ── Component ───────────────────────────────────────────────────────────────────

interface AgentTutorialProps {
  onComplete: () => void
  onSkip: () => void
  /** Whether the right-side drawer is currently open */
  drawerOpen?: boolean
  /** True once the drawer's enter animation has fully completed */
  drawerReady?: boolean
}

export function AgentTutorial({
  onComplete,
  onSkip,
  drawerOpen = false,
  drawerReady = false,
}: AgentTutorialProps) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  // Extra flag: are we waiting for the drawer to open before measuring?
  const [waitingForDrawer, setWaitingForDrawer] = useState(false)

  const current = STEPS[step]

  // ── Measure target element ──────────────────────────────────────────────────
  const measure = useCallback(() => {
    const el = document.getElementById(current.target)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Wait for scroll to settle, then measure. Use a longer delay for
      // drawer-internal elements to ensure the spring animation has finished.
      const delay = current.requiresDrawer ? 80 : 300
      setTimeout(() => {
        const updated = document.getElementById(current.target)
        if (updated) setRect(updated.getBoundingClientRect())
        else setRect(null)
      }, delay)
    } else {
      setRect(null)
    }
  }, [current.target, current.requiresDrawer])

  // ── Re-measure on step change ───────────────────────────────────────────────
  useEffect(() => {
    const needsDrawer = current.requiresDrawer

    if (needsDrawer && !drawerReady) {
      // The target is inside the drawer but the drawer hasn't opened yet.
      // Mark that we're waiting; measurement will happen once drawerReady fires.
      setWaitingForDrawer(true)
      setRect(null)
      return
    }

    setWaitingForDrawer(false)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [step, measure, current.requiresDrawer, drawerReady])

  // ── Once drawerReady flips to true, trigger deferred measurement ────────────
  useEffect(() => {
    if (drawerReady && waitingForDrawer) {
      setWaitingForDrawer(false)
      measure()
    }
  }, [drawerReady, waitingForDrawer, measure])

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1)
    else onComplete()
  }
  const prev = () => step > 0 && setStep((s) => s - 1)

  // ── Tooltip positioning ──────────────────────────────────────────────────────
  const CARD_W = 400
  const CARD_H = 300 // approximate
  const MARGIN = 24

  function tooltipStyle(): React.CSSProperties {
    if (!rect || current.position === 'center') {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      }
    }
    const mid_x = rect.left + rect.width / 2
    const mid_y = rect.top + rect.height / 2
    const vw = window.innerWidth
    const vh = window.innerHeight

    switch (current.position) {
      case 'bottom':
        return {
          top: Math.min(rect.bottom + MARGIN, vh - CARD_H - MARGIN),
          left: Math.max(MARGIN, Math.min(mid_x - CARD_W / 2, vw - CARD_W - MARGIN)),
        }
      case 'top':
        return {
          top: Math.max(MARGIN, rect.top - CARD_H - MARGIN),
          left: Math.max(MARGIN, Math.min(mid_x - CARD_W / 2, vw - CARD_W - MARGIN)),
        }
      case 'right':
        return {
          top: Math.max(MARGIN, Math.min(mid_y - CARD_H / 2, vh - CARD_H - MARGIN)),
          left: Math.min(rect.right + MARGIN, vw - CARD_W - MARGIN),
        }
      case 'left':
        return {
          top: Math.max(MARGIN, Math.min(mid_y - CARD_H / 2, vh - CARD_H - MARGIN)),
          left: Math.max(MARGIN, rect.left - CARD_W - MARGIN),
        }
    }
  }

  const Icon = current.icon

  // While waiting for the drawer to animate in, show a "waiting" loader
  // so the user knows something is coming.
  if (waitingForDrawer) {
    return (
      <div className="fixed inset-0 z-50 pointer-events-none">
        <div
          className="fixed z-[60] pointer-events-auto"
          style={{
            bottom: 32,
            right: 32,
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3"
          >
            <div className="h-4 w-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            <span className="text-xs text-slate-300">Opening drawer…</span>
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <AnimatePresence>
      <>
        {/* ── Dim backdrop ────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 pointer-events-none"
          style={{
            background:
              rect && current.position !== 'center'
                ? `radial-gradient(
                    ellipse ${rect.width + 80}px ${rect.height + 60}px at
                    ${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px,
                    transparent 50%,
                    rgba(2,6,23,0.82) 90%
                  )`
                : 'rgba(2,6,23,0.82)',
          }}
        />

        {/* ── Spotlight border ring ────────────────────────────────────────────── */}
        {rect && current.position !== 'center' && (
          <motion.div
            key={`ring-${step}`}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="fixed z-50 pointer-events-none rounded-xl"
            style={{
              top: rect.top - 6,
              left: rect.left - 6,
              width: rect.width + 12,
              height: rect.height + 12,
              border: '2.5px solid #3b82f6',
              boxShadow: '0 0 0 4px rgba(59,130,246,0.15), 0 0 30px rgba(59,130,246,0.4)',
            }}
          />
        )}

        {/* ── Animated arrow ──────────────────────────────────────────────────── */}
        {rect && current.position !== 'center' && (
          <motion.div
            key={`arrow-${step}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed z-50 pointer-events-none text-3xl select-none"
            style={{
              top:
                current.position === 'bottom'
                  ? rect.bottom + 6
                  : current.position === 'top'
                  ? rect.top - 42
                  : rect.top + rect.height / 2 - 16,
              left:
                current.position === 'left'
                  ? rect.left - 44
                  : current.position === 'right'
                  ? rect.right + 8
                  : rect.left + rect.width / 2 - 16,
            }}
          >
            <motion.span
              animate={{
                y:
                  current.position === 'bottom'
                    ? [0, -8, 0]
                    : current.position === 'top'
                    ? [0, 8, 0]
                    : 0,
                x:
                  current.position === 'left'
                    ? [0, 8, 0]
                    : current.position === 'right'
                    ? [0, -8, 0]
                    : 0,
              }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
              style={{ display: 'block' }}
            >
              {current.position === 'bottom' && '⬆️'}
              {current.position === 'top' && '⬇️'}
              {current.position === 'left' && '➡️'}
              {current.position === 'right' && '⬅️'}
            </motion.span>
          </motion.div>
        )}

        {/* ── Tutorial card ────────────────────────────────────────────────────── */}
        <motion.div
          key={`card-${step}`}
          initial={{ opacity: 0, scale: 0.92, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28 }}
          className="fixed z-[60] pointer-events-auto"
          style={{ width: CARD_W, ...tooltipStyle() }}
        >
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
            {/* Coloured top bar */}
            <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-violet-500 to-emerald-500" />

            <div className="p-6">
              {/* Header row */}
              <div className="flex items-start justify-between mb-4">
                <div className={`h-10 w-10 rounded-xl ${current.accentColor} flex items-center justify-center`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <button
                  onClick={onSkip}
                  className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded"
                  aria-label="Skip tutorial"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Title */}
              <h3 className="text-lg font-semibold text-white mb-2 leading-snug">
                {current.title}
              </h3>

              {/* Description */}
              <p className="text-sm text-slate-400 leading-relaxed mb-3">
                {current.description}
              </p>

              {/* Drawer-step notice */}
              {current.requiresDrawer && !drawerOpen && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-3">
                  <p className="text-xs text-amber-300">
                    💡 Click <strong>New Agent</strong> to open the drawer and see this field highlighted.
                  </p>
                </div>
              )}

              {/* Pro tip */}
              {current.hint && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 mb-4">
                  <p className="text-xs text-blue-300 leading-relaxed">
                    <span className="font-semibold">💡 Tip: </span>
                    {current.hint}
                  </p>
                </div>
              )}

              {/* Progress bar */}
              <div className="flex gap-1 mb-4">
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 rounded-full transition-all duration-300 ${
                      i === step
                        ? 'flex-[2] bg-blue-500'
                        : i < step
                        ? 'flex-1 bg-blue-500/40'
                        : 'flex-1 bg-slate-700'
                    }`}
                  />
                ))}
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {step + 1} / {STEPS.length}
                </span>
                <div className="flex gap-2">
                  {step > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={prev}
                      className="h-8 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
                    >
                      <ChevronLeft className="h-3 w-3 mr-1" />
                      Back
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={next}
                    className="h-8 bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    {step < STEPS.length - 1 ? (
                      <>
                        Next
                        <ChevronRight className="h-3 w-3 ml-1" />
                      </>
                    ) : (
                      <>
                        Let's Go!
                        <Sparkles className="h-3 w-3 ml-1" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  )
}

// ── Trigger button (shown in Agents header) ─────────────────────────────────────

interface AgentTutorialTriggerProps {
  onClick: () => void
}

export function AgentTutorialTrigger({ onClick }: AgentTutorialTriggerProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="text-slate-400 hover:text-white hover:bg-slate-800 gap-1.5"
    >
      <HelpCircle className="h-4 w-4" />
      <span className="text-xs">How it works</span>
    </Button>
  )
}
