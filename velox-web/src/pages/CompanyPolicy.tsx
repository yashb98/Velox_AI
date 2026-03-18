// src/pages/CompanyPolicy.tsx
// Company Policy page — lets operators define, edit, and save their AI governance
// policies. Stored in localStorage so it works without a backend endpoint.
//
// Sections:
//  1. Brand Voice      — tone, personality, forbidden phrases
//  2. Escalation Rules — when to hand off to a human
//  3. Data & Privacy   — what data agents may/may not collect
//  4. Compliance       — regulatory notices (GDPR, HIPAA, etc.)
//  5. Custom           — free-form text for anything else
//
// The saved policy JSON is also shown so devs can copy it into agent prompts.

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Shield,
  Save,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  FileText,
  AlertTriangle,
  Lock,
  MessageSquare,
  Zap,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'

// ── Types ──────────────────────────────────────────────────────────────────────

interface PolicySection {
  id: string
  title: string
  icon: React.ElementType
  color: string
  description: string
  fields: PolicyField[]
}

interface PolicyField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'list'
  placeholder: string
  help?: string
}

interface PolicyData {
  companyName: string
  effectiveDate: string
  brandVoice: {
    tone: string
    personality: string
    forbiddenPhrases: string
    greeting: string
  }
  escalation: {
    triggers: string
    handoffMessage: string
    maxConversationTurns: string
    sentimentThreshold: string
  }
  dataPrivacy: {
    allowedDataTypes: string
    forbiddenDataTypes: string
    retentionNote: string
    consentStatement: string
  }
  compliance: {
    regulations: string
    disclaimer: string
    recordingNotice: string
    jurisdiction: string
  }
  custom: {
    notes: string
  }
  updatedAt: string
}

// ── Storage key ────────────────────────────────────────────────────────────────

const POLICY_KEY = 'velox_company_policy'

const DEFAULT_POLICY: PolicyData = {
  companyName: '',
  effectiveDate: new Date().toISOString().split('T')[0],
  brandVoice: {
    tone: 'professional, warm, and concise',
    personality:
      'You are a helpful assistant who represents [Company] with professionalism and empathy. Always introduce yourself by name and stay on topic.',
    forbiddenPhrases: 'I cannot help with that\nThat\'s not my problem\nI don\'t know',
    greeting: 'Thank you for calling [Company]! How can I help you today?',
  },
  escalation: {
    triggers:
      'Customer is angry or upset\nCustomer requests a human agent\nLegal or medical question raised\nRefund over $500\nOrder not received after 14 days',
    handoffMessage: 'I\'m transferring you to a specialist who can help. Please hold for a moment.',
    maxConversationTurns: '20',
    sentimentThreshold: 'Negative sentiment for 3 consecutive turns',
  },
  dataPrivacy: {
    allowedDataTypes: 'Name\nEmail address\nOrder number\nPhone number (with consent)',
    forbiddenDataTypes:
      'Credit card numbers\nSSN / National ID\nPassport numbers\nMedical record numbers\nPasswords',
    retentionNote:
      'Conversation logs are retained for 90 days for quality assurance. Users may request deletion.',
    consentStatement:
      'This call may be recorded for quality and training purposes.',
  },
  compliance: {
    regulations: 'GDPR\nCCPA\nTCPA',
    disclaimer:
      'Information provided by this agent is for general guidance only and does not constitute legal, medical, or financial advice.',
    recordingNotice:
      'By continuing this conversation, you consent to call recording as described in our Privacy Policy.',
    jurisdiction: 'United Kingdom',
  },
  custom: {
    notes: '',
  },
  updatedAt: new Date().toISOString(),
}

function loadPolicy(): PolicyData {
  try {
    const raw = localStorage.getItem(POLICY_KEY)
    if (raw) return { ...DEFAULT_POLICY, ...JSON.parse(raw) }
  } catch { /* noop */ }
  return DEFAULT_POLICY
}

function savePolicy(data: PolicyData): void {
  try {
    localStorage.setItem(POLICY_KEY, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }))
  } catch { /* noop */ }
}

// ── Section config ─────────────────────────────────────────────────────────────

const SECTIONS: PolicySection[] = [
  {
    id: 'brandVoice',
    title: 'Brand Voice',
    icon: MessageSquare,
    color: 'text-blue-400',
    description: 'Define how your agents communicate — tone, personality, and what they must never say.',
    fields: [
      {
        key: 'tone',
        label: 'Communication Tone',
        type: 'text',
        placeholder: 'e.g. professional, warm, and concise',
        help: 'Describe the overall communication style in a few adjectives.',
      },
      {
        key: 'personality',
        label: 'Personality Prompt Fragment',
        type: 'textarea',
        placeholder: 'You are a helpful assistant who…',
        help: 'This text is prepended to every agent\'s system prompt automatically.',
      },
      {
        key: 'greeting',
        label: 'Standard Greeting',
        type: 'text',
        placeholder: 'Thank you for calling [Company]! How can I help you today?',
        help: 'The opening line agents use at the start of every conversation.',
      },
      {
        key: 'forbiddenPhrases',
        label: 'Forbidden Phrases (one per line)',
        type: 'textarea',
        placeholder: 'I cannot help\nThat\'s not my problem',
        help: 'Agents must never use these exact phrases.',
      },
    ],
  },
  {
    id: 'escalation',
    title: 'Escalation Rules',
    icon: AlertTriangle,
    color: 'text-amber-400',
    description: 'When should an agent hand off to a human? Define triggers and the handoff message.',
    fields: [
      {
        key: 'triggers',
        label: 'Escalation Triggers (one per line)',
        type: 'textarea',
        placeholder: 'Customer requests a human\nLegal question raised',
        help: 'Conditions under which the agent must transfer the call.',
      },
      {
        key: 'handoffMessage',
        label: 'Handoff Message',
        type: 'text',
        placeholder: 'I\'m transferring you to a specialist…',
        help: 'What the agent says before transferring.',
      },
      {
        key: 'maxConversationTurns',
        label: 'Max Conversation Turns',
        type: 'text',
        placeholder: '20',
        help: 'After this many exchanges, offer a human agent.',
      },
      {
        key: 'sentimentThreshold',
        label: 'Negative Sentiment Threshold',
        type: 'text',
        placeholder: 'Negative sentiment for 3 consecutive turns',
        help: 'When to escalate based on detected sentiment.',
      },
    ],
  },
  {
    id: 'dataPrivacy',
    title: 'Data & Privacy',
    icon: Lock,
    color: 'text-emerald-400',
    description: 'Specify what personal data agents may collect, store, and share.',
    fields: [
      {
        key: 'allowedDataTypes',
        label: 'Allowed Data Types (one per line)',
        type: 'textarea',
        placeholder: 'Name\nEmail\nOrder number',
        help: 'Agents may ask for and store these data types.',
      },
      {
        key: 'forbiddenDataTypes',
        label: 'Forbidden Data Types (one per line)',
        type: 'textarea',
        placeholder: 'Credit card numbers\nSSN',
        help: 'Agents must NEVER collect or repeat these.',
      },
      {
        key: 'retentionNote',
        label: 'Retention Policy Note',
        type: 'textarea',
        placeholder: 'Logs retained for 90 days…',
        help: 'Brief note on how long conversation data is kept.',
      },
      {
        key: 'consentStatement',
        label: 'Consent Statement',
        type: 'text',
        placeholder: 'This call may be recorded…',
        help: 'Agents read this at the start of recorded calls.',
      },
    ],
  },
  {
    id: 'compliance',
    title: 'Compliance',
    icon: Shield,
    color: 'text-violet-400',
    description: 'Regulatory frameworks, legal disclaimers, and recording notices.',
    fields: [
      {
        key: 'regulations',
        label: 'Applicable Regulations (one per line)',
        type: 'textarea',
        placeholder: 'GDPR\nCCPA\nTCPA',
        help: 'List every regulation your agents must comply with.',
      },
      {
        key: 'disclaimer',
        label: 'General Disclaimer',
        type: 'textarea',
        placeholder: 'Information provided is for general guidance only…',
        help: 'Agents append this to responses on sensitive topics.',
      },
      {
        key: 'recordingNotice',
        label: 'Recording Notice',
        type: 'text',
        placeholder: 'By continuing, you consent to recording…',
        help: 'Required under TCPA/GDPR when calls are recorded.',
      },
      {
        key: 'jurisdiction',
        label: 'Primary Jurisdiction',
        type: 'text',
        placeholder: 'United Kingdom',
        help: 'The legal jurisdiction governing your data processing.',
      },
    ],
  },
]

// ── Helper ─────────────────────────────────────────────────────────────────────

function getNestedValue(obj: any, sectionId: string, fieldKey: string): string {
  return obj?.[sectionId]?.[fieldKey] ?? ''
}

function setNestedValue(
  data: PolicyData,
  sectionId: string,
  fieldKey: string,
  value: string
): PolicyData {
  return {
    ...data,
    [sectionId]: {
      ...(data as any)[sectionId],
      [fieldKey]: value,
    },
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CompanyPolicy() {
  const [policy, setPolicy] = useState<PolicyData>(loadPolicy)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['brandVoice']))
  const [showJson, setShowJson] = useState(false)
  const [copied, setCopied] = useState(false)

  // Auto-save indicator
  useEffect(() => {
    setSaved(false)
  }, [policy])

  function handleSave() {
    setSaving(true)
    setTimeout(() => {
      savePolicy({ ...policy, updatedAt: new Date().toISOString() })
      setSaving(false)
      setSaved(true)
      toast.success('Company policy saved!')
      setTimeout(() => setSaved(false), 3000)
    }, 400)
  }

  function handleReset() {
    if (!confirm('Reset all fields to defaults? This cannot be undone.')) return
    setPolicy(DEFAULT_POLICY)
    localStorage.removeItem(POLICY_KEY)
    toast.success('Policy reset to defaults')
  }

  function toggleSection(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleCopyJson() {
    const json = JSON.stringify(policy, null, 2)
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Policy JSON copied!')
    })
  }

  const lastUpdated = policy.updatedAt
    ? new Date(policy.updatedAt).toLocaleString()
    : '—'

  return (
    <div className="min-h-screen bg-slate-950">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-b border-slate-800 bg-slate-950/95 backdrop-blur sticky top-0 z-10"
      >
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <Shield className="h-4 w-4 text-violet-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Company Policy</h1>
              <p className="text-xs text-slate-500">
                AI governance, brand voice, and compliance rules for your agents
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {policy.updatedAt && (
              <span className="text-xs text-slate-600 hidden sm:block">
                Last saved: {lastUpdated}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : saved ? (
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1.5" />
              )}
              {saved ? 'Saved!' : 'Save Policy'}
            </Button>
          </div>
        </div>
      </motion.div>

      <div className="container mx-auto px-6 py-8 max-w-3xl space-y-6">

        {/* ── Info banner ─────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4"
        >
          <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-300 leading-relaxed">
            This policy is saved locally and can be referenced when configuring agent system prompts.
            Use the <strong>Copy JSON</strong> button to paste the full policy into an agent's instructions.
          </p>
        </motion.div>

        {/* ── Company meta ────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4"
        >
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-400" />
            Company Details
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">Company Name</Label>
              <Input
                value={policy.companyName}
                onChange={(e) => setPolicy((p) => ({ ...p, companyName: e.target.value }))}
                placeholder="Acme Corp"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-violet-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">Effective Date</Label>
              <Input
                type="date"
                value={policy.effectiveDate}
                onChange={(e) => setPolicy((p) => ({ ...p, effectiveDate: e.target.value }))}
                className="bg-slate-800 border-slate-700 text-white focus:border-violet-500"
              />
            </div>
          </div>
        </motion.div>

        {/* ── Policy sections ─────────────────────────────────────────────────── */}
        {SECTIONS.map((section, idx) => {
          const Icon = section.icon
          const isOpen = expanded.has(section.id)
          return (
            <motion.div
              key={section.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + idx * 0.05 }}
              className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden"
            >
              {/* Section header — clickable to expand */}
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center`}>
                    <Icon className={`h-4 w-4 ${section.color}`} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-white">{section.title}</p>
                    <p className="text-xs text-slate-500">{section.description}</p>
                  </div>
                </div>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-slate-500 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                )}
              </button>

              {/* Section fields */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-6 space-y-5 border-t border-slate-800 pt-5">
                      {section.fields.map((field) => (
                        <div key={field.key} className="space-y-1.5">
                          <Label className="text-slate-300 text-xs">{field.label}</Label>
                          {field.type === 'textarea' ? (
                            <Textarea
                              rows={4}
                              value={getNestedValue(policy, section.id, field.key)}
                              onChange={(e) =>
                                setPolicy((p) =>
                                  setNestedValue(p, section.id, field.key, e.target.value)
                                )
                              }
                              placeholder={field.placeholder}
                              className="resize-y bg-slate-800 border-slate-700 text-white placeholder:text-slate-600 focus:border-violet-500 text-sm leading-relaxed"
                            />
                          ) : (
                            <Input
                              value={getNestedValue(policy, section.id, field.key)}
                              onChange={(e) =>
                                setPolicy((p) =>
                                  setNestedValue(p, section.id, field.key, e.target.value)
                                )
                              }
                              placeholder={field.placeholder}
                              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-violet-500"
                            />
                          )}
                          {field.help && (
                            <p className="text-xs text-slate-500">{field.help}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}

        {/* ── Custom notes section ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-white">Custom Notes</h2>
          </div>
          <Textarea
            rows={5}
            value={policy.custom.notes}
            onChange={(e) => setPolicy((p) => ({ ...p, custom: { notes: e.target.value } }))}
            placeholder="Any additional policy notes, edge cases, or agent-specific instructions not covered above…"
            className="resize-y bg-slate-800 border-slate-700 text-white placeholder:text-slate-600 focus:border-violet-500 text-sm leading-relaxed"
          />
        </motion.div>

        {/* ── Export JSON ──────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden"
        >
          <button
            onClick={() => setShowJson((v) => !v)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center">
                <FileText className="h-4 w-4 text-slate-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">Export Policy JSON</p>
                <p className="text-xs text-slate-500">
                  Copy this into your agent's system prompt to enforce the full policy
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => { e.stopPropagation(); handleCopyJson() }}
                className="h-7 border-slate-700 text-slate-300 hover:text-white"
              >
                {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {copied ? 'Copied!' : 'Copy'}
              </Button>
              {showJson ? (
                <ChevronUp className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              )}
            </div>
          </button>

          <AnimatePresence initial={false}>
            {showJson && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="border-t border-slate-800 p-4">
                  <pre className="text-xs text-slate-300 bg-slate-950 rounded-lg p-4 overflow-x-auto leading-relaxed max-h-80 overflow-y-auto">
                    {JSON.stringify(policy, null, 2)}
                  </pre>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── Bottom save bar ──────────────────────────────────────────────────── */}
        <div className="flex justify-end pb-8">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="bg-violet-600 hover:bg-violet-500 text-white px-6"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : saved ? (
              <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-400" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {saved ? 'Policy Saved!' : 'Save Policy'}
          </Button>
        </div>

      </div>
    </div>
  )
}
