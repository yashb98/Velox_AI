// src/components/playground/EnterpriseEmptyState.tsx
// Rebuilt: dark theme, richer template cards with category chips and action hints,
// and a "What next?" guide strip at the bottom.

import { motion } from 'framer-motion'
import {
  FileText,
  Search,
  MessageSquare,
  Zap,
  ArrowRight,
  Bot,
  Wrench,
  GitBranch,
} from 'lucide-react'

// ── Template definitions ────────────────────────────────────────────────────────

interface Template {
  id: string
  title: string
  description: string
  prompt: string
  icon: React.ElementType
  category: string
  categoryColor: string
  hint: string
}

const templates: Template[] = [
  {
    id: '1',
    title: 'Test Knowledge Base',
    description: 'Ask a question that should be answered from your uploaded documents.',
    prompt:
      'Search our documentation for information about return policies and summarize the key points.',
    icon: Search,
    category: 'RAG',
    categoryColor: 'text-blue-400',
    hint: 'Tests whether the agent retrieves the right content from the knowledge base.',
  },
  {
    id: '2',
    title: 'Simulate a Customer Call',
    description: 'Role-play as a customer with a real support issue to test conversation flow.',
    prompt:
      "Hi, I placed an order last week (order #12345) and I haven't received a shipping confirmation yet. Can you help?",
    icon: MessageSquare,
    category: 'Conversation',
    categoryColor: 'text-emerald-400',
    hint: 'Tests order lookup tools and how naturally the agent handles a multi-step support request.',
  },
  {
    id: '3',
    title: 'Check Tool Integrations',
    description: 'Trigger an external API call to verify tool connections are working.',
    prompt:
      'Check the current inventory status for wireless keyboards and let me know which models are in stock.',
    icon: Zap,
    category: 'Tools',
    categoryColor: 'text-amber-400',
    hint: 'Verifies the inventory/CRM tool is wired correctly and returning live data.',
  },
  {
    id: '4',
    title: 'Multi-Step Workflow',
    description: 'Test a complex scenario that requires multiple tool calls and decision points.',
    prompt:
      "I want to return a damaged product (order #98765), get a refund, and then place a new order for a replacement item.",
    icon: FileText,
    category: 'Complex',
    categoryColor: 'text-violet-400',
    hint: 'Stresses the agent with a scenario that needs return, refund, and reorder tools in sequence.',
  },
]

const nextSteps = [
  {
    icon: Bot,
    label: 'Check the Inspector',
    desc: 'Right panel shows live metrics, settings, and event log.',
  },
  {
    icon: Wrench,
    label: 'Test Edge Cases',
    desc: 'Try rude, vague, or off-topic messages.',
  },
  {
    icon: GitBranch,
    label: 'Compare Agents',
    desc: 'Open a different agent to A/B test prompts.',
  },
]

interface EnterpriseEmptyStateProps {
  onTemplateSelect: (template: { prompt: string }) => void
}

export function EnterpriseEmptyState({ onTemplateSelect }: EnterpriseEmptyStateProps) {
  return (
    <motion.div
      id="chat-area"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-start justify-center min-h-full py-12"
    >
      <div className="max-w-3xl w-full px-4">
        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 mb-4">
            <Bot className="h-7 w-7 text-blue-400" />
          </div>
          <h2 className="text-2xl font-semibold text-white mb-2">
            Start Testing Your Agent
          </h2>
          <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
            Select a test scenario below to fire off your first message, or type anything in the
            input at the bottom. Nothing here affects live calls.
          </p>
        </motion.div>

        {/* ── Template Grid ────────────────────────────────────────────────────── */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
          }}
          className="grid md:grid-cols-2 gap-3 mb-8"
        >
          {templates.map((template) => {
            const Icon = template.icon
            return (
              <motion.button
                key={template.id}
                variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
                onClick={() => onTemplateSelect(template)}
                className="text-left group w-full"
              >
                <div className="h-full p-4 rounded-xl border border-slate-800 bg-slate-900 hover:border-blue-500/40 hover:bg-slate-800/80 transition-all duration-200">
                  {/* Top row */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="h-9 w-9 rounded-lg bg-slate-800 group-hover:bg-slate-700 flex items-center justify-center shrink-0 transition-colors">
                      <Icon className="h-4 w-4 text-slate-400 group-hover:text-white transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-sm font-semibold text-white leading-snug">
                          {template.title}
                        </span>
                        <span className={`text-[10px] font-mono font-semibold uppercase tracking-wide ${template.categoryColor}`}>
                          {template.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {template.description}
                      </p>
                    </div>
                  </div>

                  {/* Prompt preview */}
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 mb-3 text-xs text-slate-400 font-mono leading-relaxed">
                    {template.prompt.length > 110
                      ? `${template.prompt.substring(0, 110)}…`
                      : template.prompt}
                  </div>

                  {/* Hint + CTA */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-600 italic leading-relaxed flex-1">
                      {template.hint}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-blue-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      Run
                      <ArrowRight className="h-3 w-3" />
                    </div>
                  </div>
                </div>
              </motion.button>
            )
          })}
        </motion.div>

        {/* ── Pro tips strip ───────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="border border-slate-800 rounded-xl bg-slate-900/50 p-4"
        >
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-3">
            💡 Pro tips for better testing
          </p>
          <div className="grid grid-cols-3 gap-4">
            {nextSteps.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-2">
                <Icon className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-slate-300">{label}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
