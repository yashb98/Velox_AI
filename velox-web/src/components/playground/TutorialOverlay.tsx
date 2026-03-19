// src/components/playground/TutorialOverlay.tsx
// Rebuilt: warm theme, better spotlight, cleaner step descriptions

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { X, ChevronRight, ChevronLeft, Sparkles, Play } from 'lucide-react'

// ── Step definitions ────────────────────────────────────────────────────────────

interface TutorialStep {
  title: string
  description: string
  action?: string
  icon: string
  target: string
  position: 'top' | 'bottom' | 'left' | 'right' | 'center'
}

const tutorialSteps: TutorialStep[] = [
  {
    title: 'Welcome to the Playground',
    description:
      'This is your safe testing sandbox. Talk to your AI agent exactly as a caller would — without making a real phone call. Experiment freely; nothing here affects live traffic.',
    action: 'Click Next to take a quick tour of each section.',
    icon: '👋',
    target: 'playground-header',
    position: 'bottom',
  },
  {
    title: 'Which Agent Are You Testing?',
    description:
      'The badge in the top bar shows the active agent\'s name. Each agent has its own personality, voice, tools, and system prompt — so results may differ between agents.',
    action: 'Switch agents from the Agents page to compare behaviours.',
    icon: '🏷️',
    target: 'action-buttons',
    position: 'bottom',
  },
  {
    title: 'Export & Clear',
    description:
      'Export saves the full conversation as a JSON file — useful for sharing test results or debugging. Clear resets the chat so you can start a fresh test scenario.',
    action: 'Keyboard shortcuts: ⌘K to clear, ⌘E to export.',
    icon: '⚡',
    target: 'action-buttons',
    position: 'bottom',
  },
  {
    title: 'Inspector Panel — Your Control Centre',
    description:
      'The right panel shows everything about this session: model settings (temperature, max tokens), live metrics (latency, tokens used, cost), event log, and the agent\'s system prompt.',
    action: 'Adjust Temperature and Max Tokens sliders to change behaviour.',
    icon: '⚙️',
    target: 'sidebar',
    position: 'left',
  },
  {
    title: 'Live Metrics',
    description:
      'Watch these numbers update in real-time as you chat. Latency shows how fast the AI responds. Token count and estimated cost help you understand usage before you go live.',
    action: 'Send a message and watch the metrics update instantly.',
    icon: '📊',
    target: 'stats-card',
    position: 'left',
  },
  {
    title: 'Chat Area — Start a Conversation',
    description:
      'The central area shows the conversation thread. User messages appear on the right, assistant responses on the left. Tool calls (like database lookups) appear in purple.',
    action: 'Click a template card below to fire off your first test message.',
    icon: '💬',
    target: 'chat-area',
    position: 'top',
  },
  {
    title: 'Type Your Own Message',
    description:
      'Use the input at the bottom to type any message. Press Enter to send. Try edge cases, unusual questions, or role-play as a difficult customer to stress-test the agent.',
    action: 'Press Shift+Enter to add a new line without sending.',
    icon: '✍️',
    target: 'chat-input',
    position: 'top',
  },
  {
    title: 'You\'re Ready to Test!',
    description:
      'The Playground is your most powerful debugging tool. Use it to validate the system prompt, test tool integrations, and ensure the agent handles edge cases gracefully.',
    action: 'Start with a template card, then try your own scenarios!',
    icon: '🚀',
    target: 'playground-header',
    position: 'center',
  },
]

// ── Component ───────────────────────────────────────────────────────────────────

interface TutorialOverlayProps {
  onComplete: () => void
  onSkip: () => void
}

const CARD_W = 420
const CARD_H = 320
const MARGIN = 20

export function TutorialOverlay({ onComplete, onSkip }: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const step = tutorialSteps[currentStep]

  const measure = useCallback(() => {
    const el = document.getElementById(step.target)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => setRect(el.getBoundingClientRect()), 250)
    } else {
      setRect(null)
    }
  }, [step.target])

  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  const next = () => {
    if (currentStep < tutorialSteps.length - 1) setCurrentStep((s) => s + 1)
    else { onComplete() }
  }

  const prev = () => currentStep > 0 && setCurrentStep((s) => s - 1)

  // ── Card position ─────────────────────────────────────────────────────────────
  function cardStyle(): React.CSSProperties {
    if (!rect || step.position === 'center') {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    }
    const mx = rect.left + rect.width / 2
    const my = rect.top + rect.height / 2
    const vw = window.innerWidth
    const vh = window.innerHeight

    const clampX = (x: number) => Math.max(MARGIN, Math.min(x, vw - CARD_W - MARGIN))
    const clampY = (y: number) => Math.max(MARGIN, Math.min(y, vh - CARD_H - MARGIN))

    switch (step.position) {
      case 'bottom':
        return { top: clampY(rect.bottom + 24), left: clampX(mx - CARD_W / 2) }
      case 'top':
        return { top: clampY(rect.top - CARD_H - 24), left: clampX(mx - CARD_W / 2) }
      case 'left':
        return { top: clampY(my - CARD_H / 2), left: clampX(rect.left - CARD_W - 24) }
      case 'right':
        return { top: clampY(my - CARD_H / 2), left: clampX(rect.right + 24) }
    }
  }

  return (
    <AnimatePresence>
      <>
        {/* ── Dim backdrop ─────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 pointer-events-none"
          style={{
            background:
              rect && step.position !== 'center'
                ? `radial-gradient(
                    ellipse ${rect.width + 80}px ${rect.height + 60}px at
                    ${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px,
                    transparent 45%,
                    rgba(28,25,23,0.85) 85%
                  )`
                : 'rgba(28,25,23,0.85)',
          }}
        />

        {/* ── Spotlight ring ───────────────────────────────────────────────────── */}
        {rect && step.position !== 'center' && (
          <motion.div
            key={`ring-${currentStep}`}
            initial={{ opacity: 0, scale: 0.93 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="fixed z-50 pointer-events-none rounded-xl"
            style={{
              top: rect.top - 6,
              left: rect.left - 6,
              width: rect.width + 12,
              height: rect.height + 12,
              border: '2px solid #d97706',
              boxShadow: '0 0 0 4px rgba(217,119,6,0.12), 0 0 28px rgba(217,119,6,0.45)',
            }}
          />
        )}

        {/* ── Bouncing arrow ───────────────────────────────────────────────────── */}
        {rect && step.position !== 'center' && (
          <motion.div
            key={`arrow-${currentStep}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed z-50 pointer-events-none text-3xl select-none"
            style={{
              top:
                step.position === 'bottom'
                  ? rect.bottom + 4
                  : step.position === 'top'
                  ? rect.top - 44
                  : rect.top + rect.height / 2 - 16,
              left:
                step.position === 'left'
                  ? rect.left - 46
                  : step.position === 'right'
                  ? rect.right + 8
                  : rect.left + rect.width / 2 - 16,
            }}
          >
            <motion.span
              animate={{
                y: step.position === 'bottom' ? [0, -8, 0] : step.position === 'top' ? [0, 8, 0] : 0,
                x: step.position === 'left' ? [0, 8, 0] : step.position === 'right' ? [0, -8, 0] : 0,
              }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
              style={{ display: 'block' }}
            >
              {step.position === 'bottom' && '⬆️'}
              {step.position === 'top'    && '⬇️'}
              {step.position === 'left'   && '➡️'}
              {step.position === 'right'  && '⬅️'}
            </motion.span>
          </motion.div>
        )}

        {/* ── Tutorial card ─────────────────────────────────────────────────────── */}
        <motion.div
          key={`card-${currentStep}`}
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="fixed z-[60] pointer-events-auto"
          style={{ width: CARD_W, ...cardStyle() }}
        >
          <div className="bg-white border border-stone-200 rounded-2xl shadow-2xl overflow-hidden">
            {/* Gradient accent bar */}
            <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-red-500" />

            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="text-4xl leading-none">{step.icon}</div>
                <button
                  onClick={onSkip}
                  className="text-stone-400 hover:text-stone-600 transition-colors p-1 rounded"
                  aria-label="Skip tutorial"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Title */}
              <h3 className="text-lg font-semibold text-stone-900 mb-2 leading-snug">
                {step.title}
              </h3>

              {/* Description */}
              <p className="text-sm text-stone-600 leading-relaxed mb-3">
                {step.description}
              </p>

              {/* Action hint */}
              {step.action && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                  <Play className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800 leading-relaxed">{step.action}</p>
                </div>
              )}

              {/* Progress segments */}
              <div className="flex gap-1 mb-4">
                {tutorialSteps.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 rounded-full transition-all duration-300 ${
                      i === currentStep
                        ? 'flex-[2] bg-amber-500'
                        : i < currentStep
                        ? 'flex-1 bg-amber-300'
                        : 'flex-1 bg-stone-200'
                    }`}
                  />
                ))}
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-500">
                  {currentStep + 1} of {tutorialSteps.length}
                </span>
                <div className="flex gap-2">
                  {currentStep > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={prev}
                      className="h-8 border-stone-300 text-stone-600 hover:text-stone-900 hover:bg-stone-100"
                    >
                      <ChevronLeft className="h-3 w-3 mr-1" />
                      Back
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={next}
                    className="h-8 bg-amber-600 hover:bg-amber-500 text-white"
                  >
                    {currentStep < tutorialSteps.length - 1 ? (
                      <>
                        Next
                        <ChevronRight className="h-3 w-3 ml-1" />
                      </>
                    ) : (
                      <>
                        Start Testing!
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
