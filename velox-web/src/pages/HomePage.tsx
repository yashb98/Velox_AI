// src/pages/HomePage.tsx — landing page: dark slate theme, vivid contrast, /docs link wired

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Link } from 'react-router-dom'
import {
  Bot,
  Zap,
  Shield,
  TrendingUp,
  MessageSquare,
  PhoneCall,
  BarChart3,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Users,
  Clock,
  DollarSign,
  BookOpen,
  ChevronRight,
} from 'lucide-react'

// ── Animation variants ─────────────────────────────────────────────────────────
const fadeInUp = {
  hidden: { opacity: 0, y: 60 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' as const } },
}
const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.15 } },
}
const scaleIn = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: 'easeOut' as const } },
}
const slideInLeft = {
  hidden: { opacity: 0, x: -60 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: 'easeOut' as const } },
}
const slideInRight = {
  hidden: { opacity: 0, x: 60 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: 'easeOut' as const } },
}

// ── Feature cards ──────────────────────────────────────────────────────────────
const features = [
  {
    icon: Bot,
    title: 'Visual Flow Builder',
    description:
      'Design conversation flows with our no-code drag-and-drop interface. Map intents, conditions, and tool calls without writing a single line of code.',
    gradient: 'from-blue-500/20 to-blue-600/5',
    iconColor: 'text-blue-400',
    border: 'border-blue-500/20 hover:border-blue-400/50',
  },
  {
    icon: Zap,
    title: 'Lightning Fast — < 2 s',
    description:
      'Sub-2-second voice response powered by Gemini 2.5 Flash, Deepgram Nova-2 STT, and our optimised hybrid RAG pipeline.',
    gradient: 'from-amber-500/20 to-amber-600/5',
    iconColor: 'text-amber-400',
    border: 'border-amber-500/20 hover:border-amber-400/50',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description:
      'Clerk RS256 JWT auth, org-level data isolation, Twilio webhook signature validation, and Stripe webhook verification baked in.',
    gradient: 'from-emerald-500/20 to-emerald-600/5',
    iconColor: 'text-emerald-400',
    border: 'border-emerald-500/20 hover:border-emerald-400/50',
  },
  {
    icon: MessageSquare,
    title: 'Hybrid RAG',
    description:
      'BM25 keyword search + Gemini vector semantic search, merged and re-ranked so agents always retrieve the most relevant context.',
    gradient: 'from-violet-500/20 to-violet-600/5',
    iconColor: 'text-violet-400',
    border: 'border-violet-500/20 hover:border-violet-400/50',
  },
  {
    icon: BarChart3,
    title: 'Real-time Analytics',
    description:
      'Live call volume, sentiment scores, Prometheus metrics, and LangFuse tracing — every call fully observable from day one.',
    gradient: 'from-rose-500/20 to-rose-600/5',
    iconColor: 'text-rose-400',
    border: 'border-rose-500/20 hover:border-rose-400/50',
  },
  {
    icon: DollarSign,
    title: 'Usage-Based Billing',
    description:
      'Pay per minute, not per seat. Stripe-powered subscriptions with transparent per-minute pricing and automatic balance gates.',
    gradient: 'from-orange-500/20 to-orange-600/5',
    iconColor: 'text-orange-400',
    border: 'border-orange-500/20 hover:border-orange-400/50',
  },
]

// ── How It Works ───────────────────────────────────────────────────────────────
const steps = [
  {
    step: '01',
    emoji: '🎨',
    title: 'Design Your Flow',
    description:
      'Use our visual builder to create conversation flows. Add prompts, tools, conditions, and handoffs with simple drag-and-drop. No code required.',
    direction: 'left' as const,
  },
  {
    step: '02',
    emoji: '📚',
    title: 'Upload Your Knowledge',
    description:
      'Upload PDFs and text files. Our hybrid search (BM25 + vector) automatically retrieves the most relevant context for every caller question.',
    direction: 'right' as const,
  },
  {
    step: '03',
    emoji: '🚀',
    title: 'Deploy & Monitor',
    description:
      'Connect your Twilio number, go live in minutes, and monitor every call in real time — sentiment, cost, latency, all in one dashboard.',
    direction: 'left' as const,
  },
]

// ── Stats ──────────────────────────────────────────────────────────────────────
const stats = [
  { icon: Users,     label: 'Active Users',  value: '10K+',  color: 'text-blue-400'   },
  { icon: PhoneCall, label: 'Calls Handled', value: '1M+',   color: 'text-emerald-400'},
  { icon: Clock,     label: 'Avg Response',  value: '< 2 s', color: 'text-amber-400'  },
  { icon: TrendingUp,label: 'Uptime',        value: '99.9%', color: 'text-violet-400' },
]

// ── AI models ──────────────────────────────────────────────────────────────────
const models = [
  {
    model: 'Phi-3-mini SLM',
    tag: 'Fast',
    desc: 'FAQs, yes/no, short answers — runs locally',
    border: 'border-emerald-500/40 bg-emerald-500/5',
    badge: 'bg-emerald-500/20 text-emerald-300',
  },
  {
    model: 'Gemini Flash',
    tag: 'Balanced',
    desc: 'Multi-turn, tool calling, reasoning',
    border: 'border-blue-500/40 bg-blue-500/5',
    badge: 'bg-blue-500/20 text-blue-300',
  },
  {
    model: 'Gemini Pro',
    tag: 'Powerful',
    desc: 'Complex decisions, escalations',
    border: 'border-violet-500/40 bg-violet-500/5',
    badge: 'bg-violet-500/20 text-violet-300',
  },
]

// ── Component ──────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur"
      >
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">Velox AI</span>
          </div>

          {/* Nav links */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="text-slate-300 hover:text-white hover:bg-slate-800"
            >
              <Link to="/billing">Pricing</Link>
            </Button>

            {/* ── DOCUMENTATION LINK ── wired to /docs */}
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="text-slate-300 hover:text-white hover:bg-slate-800"
            >
              <Link to="/docs">
                <BookOpen className="h-4 w-4 mr-1.5" />
                Docs
              </Link>
            </Button>

            <Button
              size="sm"
              asChild
              className="ml-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold"
            >
              <Link to="/agents/demo/playground">Try Demo</Link>
            </Button>
          </div>
        </div>
      </motion.nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-24 md:py-36">
        {/* ambient glows */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-blue-600/10 blur-3xl" />
          <div className="absolute top-40 left-1/4 h-64 w-64 rounded-full bg-violet-600/10 blur-2xl" />
          <div className="absolute top-20 right-1/4 h-64 w-64 rounded-full bg-emerald-600/10 blur-2xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="max-w-4xl mx-auto text-center space-y-8"
          >
            <motion.div variants={fadeInUp}>
              <Badge className="bg-blue-600/20 text-blue-300 border-blue-500/30 hover:bg-blue-600/30 px-4 py-1.5 text-sm">
                <Sparkles className="h-3.5 w-3.5 mr-2" />
                Powered by Gemini 2.5 Flash · Deepgram Nova-2 · Google ADK
              </Badge>
            </motion.div>

            <motion.h1
              variants={fadeInUp}
              className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight"
            >
              <span className="text-white">Build AI Voice Agents</span>
              <span className="block bg-gradient-to-r from-blue-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent mt-2">
                In Minutes, Not Months
              </span>
            </motion.h1>

            <motion.p
              variants={fadeInUp}
              className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed"
            >
              The no-code platform for creating intelligent AI voice agents. Handle customer
              calls, appointments, and support — powered by advanced RAG and multi-model routing.
            </motion.p>

            <motion.div variants={fadeInUp} className="flex flex-wrap gap-4 justify-center">
              <Button
                size="lg"
                asChild
                className="bg-blue-600 hover:bg-blue-500 text-white text-base px-8 shadow-lg shadow-blue-600/25"
              >
                <Link to="/agents/demo/flow">
                  Start Building Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white text-base px-8"
              >
                <Link to="/agents/demo/playground">Try Playground</Link>
              </Button>
            </motion.div>

            <motion.div
              variants={fadeInUp}
              className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-400"
            >
              {['No credit card required', '1,000 free minutes', 'Setup in 5 minutes'].map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>{t}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <section className="border-y border-slate-800 bg-slate-900/50 py-14">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-2 md:grid-cols-4 gap-8"
          >
            {stats.map((s) => (
              <motion.div key={s.label} variants={scaleIn} className="text-center">
                <s.icon className={`h-7 w-7 mx-auto mb-3 ${s.color}`} />
                <div className="text-3xl font-bold text-white mb-1">{s.value}</div>
                <div className="text-sm text-slate-400">{s.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="text-center max-w-2xl mx-auto mb-16"
          >
            <h2 className="text-4xl font-bold text-white mb-4">Everything You Need</h2>
            <p className="text-xl text-slate-400">
              Production-ready features to build enterprise-grade voice AI — no ML expertise required.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {features.map((f) => (
              <motion.div key={f.title} variants={scaleIn}>
                <div
                  className={`h-full p-6 rounded-2xl border bg-gradient-to-br ${f.gradient} ${f.border} transition-all duration-300 hover:shadow-lg hover:shadow-black/40`}
                >
                  <f.icon className={`h-10 w-10 mb-4 ${f.iconColor}`} />
                  <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{f.description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────────────────── */}
      <section className="py-24 border-y border-slate-800 bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="text-center max-w-2xl mx-auto mb-16"
          >
            <h2 className="text-4xl font-bold text-white mb-4">How It Works</h2>
            <p className="text-xl text-slate-400">
              Get your AI voice agent answering real calls in three steps.
            </p>
          </motion.div>

          <div className="max-w-3xl mx-auto space-y-8">
            {steps.map((item, i) => (
              <motion.div
                key={item.step}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={i % 2 === 0 ? slideInLeft : slideInRight}
              >
                <div className="p-8 rounded-2xl border border-slate-700 bg-slate-900 hover:border-slate-600 transition-colors">
                  <div className="flex items-start gap-6">
                    <div className="text-5xl shrink-0">{item.emoji}</div>
                    <div className="flex-1">
                      <div className="text-xs font-mono text-blue-400 mb-2 tracking-widest uppercase">
                        Step {item.step}
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">{item.title}</h3>
                      <p className="text-slate-400 leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI Pipeline callout ─────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="rounded-2xl border border-slate-700 bg-slate-900 p-10"
          >
            <div className="grid md:grid-cols-2 gap-10 items-center">
              <div>
                <Badge className="bg-violet-600/20 text-violet-300 border-violet-500/30 mb-4">
                  Multi-Agent AI Pipeline
                </Badge>
                <h3 className="text-3xl font-bold text-white mb-4">
                  The Right Model for Every Turn
                </h3>
                <p className="text-slate-400 mb-6 leading-relaxed">
                  Not every query needs top-tier compute. Our intelligent router uses Phi-3-mini
                  for simple FAQs, Gemini Flash for most conversations, and Gemini Pro only when
                  it truly matters — cutting costs by up to 70 %.
                </p>
                <Button
                  variant="outline"
                  asChild
                  className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white"
                >
                  <Link to="/docs#pipeline">
                    Read the docs
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>

              <div className="space-y-3">
                {models.map((m) => (
                  <div
                    key={m.model}
                    className={`flex items-center justify-between p-4 rounded-xl border ${m.border}`}
                  >
                    <div>
                      <div className="font-semibold text-white text-sm">{m.model}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{m.desc}</div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${m.badge}`}>
                      {m.tag}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            <div className="relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-600/20 via-slate-900 to-violet-600/10 p-14 text-center">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-600/5 to-transparent" />
              <h2 className="relative text-4xl font-bold text-white mb-4">
                Ready to Transform Your Customer Experience?
              </h2>
              <p className="relative text-xl text-slate-400 mb-8 max-w-2xl mx-auto">
                Join thousands of companies using Velox AI to handle millions of conversations.
              </p>
              <div className="relative flex flex-wrap gap-4 justify-center">
                <Button
                  size="lg"
                  asChild
                  className="bg-blue-600 hover:bg-blue-500 text-white px-8 shadow-lg shadow-blue-600/30 text-base"
                >
                  <Link to="/agents/demo/flow">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white px-8 text-base"
                >
                  <Link to="/docs">Read the Docs</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800 py-14">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-10 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold text-white">Velox AI</span>
              </div>
              <p className="text-sm text-slate-500">
                Enterprise AI voice agent platform — build, deploy, and scale.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-slate-200 mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><Link to="/docs" className="hover:text-slate-300 transition-colors">Documentation</Link></li>
                <li><Link to="/docs#api" className="hover:text-slate-300 transition-colors">API Reference</Link></li>
                <li><Link to="/billing" className="hover:text-slate-300 transition-colors">Pricing</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-slate-200 mb-4">Platform</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><Link to="/agents" className="hover:text-slate-300 transition-colors">Agents</Link></li>
                <li><Link to="/knowledge" className="hover:text-slate-300 transition-colors">Knowledge Base</Link></li>
                <li><Link to="/calls" className="hover:text-slate-300 transition-colors">Call History</Link></li>
                <li><Link to="/dashboard" className="hover:text-slate-300 transition-colors">Dashboard</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-slate-200 mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><Link to="/privacy" className="hover:text-slate-300 transition-colors">Privacy</Link></li>
                <li><Link to="/terms" className="hover:text-slate-300 transition-colors">Terms</Link></li>
                <li><Link to="/security" className="hover:text-slate-300 transition-colors">Security</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-slate-800 text-center text-sm text-slate-600">
            © 2026 Velox AI. All rights reserved. Built with Gemini · Deepgram · Twilio · Google ADK
          </div>
        </div>
      </footer>
    </div>
  )
}
