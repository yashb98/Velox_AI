// src/pages/HomePage.tsx — Enhanced landing page with dark/light mode toggle,
// animated counters, use cases, testimonials, Why Velox section, and more.

import { useState, useEffect, useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Link } from 'react-router-dom'
import {
  Bot, Zap, Shield, TrendingUp, MessageSquare, PhoneCall, BarChart3,
  Sparkles, ArrowRight, CheckCircle2, Users, Clock, DollarSign,
  BookOpen, ChevronRight, Sun, Moon, Star, Building2, Headphones,
  CalendarCheck, HelpCircle, Workflow, Globe,
} from 'lucide-react'

// ── Animation variants ─────────────────────────────────────────────────────────
const fadeInUp = {
  hidden: { opacity: 0, y: 60 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' as const } },
}
const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.12 } },
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

// ── Animated counter ───────────────────────────────────────────────────────────
function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })

  useEffect(() => {
    if (!inView) return
    const duration = 1500
    const steps = 60
    const increment = target / steps
    let current = 0
    const timer = setInterval(() => {
      current += increment
      if (current >= target) { setCount(target); clearInterval(timer) }
      else setCount(Math.floor(current))
    }, duration / steps)
    return () => clearInterval(timer)
  }, [inView, target])

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>
}

// ── Data ───────────────────────────────────────────────────────────────────────
const features = [
  {
    icon: Bot,
    title: 'Visual Flow Builder',
    description: 'Design conversation flows with our no-code drag-and-drop interface. Map intents, conditions, and tool calls without writing a single line of code.',
    gradient: 'from-blue-500/20 to-blue-600/5',
    iconColor: 'text-blue-400',
    border: 'border-blue-500/20 hover:border-blue-400/50',
  },
  {
    icon: Zap,
    title: 'Lightning Fast — < 2 s',
    description: 'Sub-2-second voice response powered by Gemini 2.5 Flash, Deepgram Nova-2 STT, and our optimised hybrid RAG pipeline.',
    gradient: 'from-amber-500/20 to-amber-600/5',
    iconColor: 'text-amber-400',
    border: 'border-amber-500/20 hover:border-amber-400/50',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'Clerk RS256 JWT auth, org-level data isolation, Twilio webhook signature validation, and Stripe verification baked in.',
    gradient: 'from-emerald-500/20 to-emerald-600/5',
    iconColor: 'text-emerald-400',
    border: 'border-emerald-500/20 hover:border-emerald-400/50',
  },
  {
    icon: MessageSquare,
    title: 'Hybrid RAG',
    description: 'BM25 keyword search + Gemini vector semantic search, merged and re-ranked so agents always retrieve the most relevant context.',
    gradient: 'from-violet-500/20 to-violet-600/5',
    iconColor: 'text-violet-400',
    border: 'border-violet-500/20 hover:border-violet-400/50',
  },
  {
    icon: BarChart3,
    title: 'Real-time Analytics',
    description: 'Live call volume, sentiment scores, Prometheus metrics, and LangFuse tracing — every call fully observable from day one.',
    gradient: 'from-rose-500/20 to-rose-600/5',
    iconColor: 'text-rose-400',
    border: 'border-rose-500/20 hover:border-rose-400/50',
  },
  {
    icon: DollarSign,
    title: 'Usage-Based Billing',
    description: 'Pay per minute, not per seat. Stripe-powered subscriptions with transparent per-minute pricing and automatic balance gates.',
    gradient: 'from-orange-500/20 to-orange-600/5',
    iconColor: 'text-orange-400',
    border: 'border-orange-500/20 hover:border-orange-400/50',
  },
]

const useCases = [
  {
    icon: Headphones,
    title: 'Customer Support',
    description: 'Handle FAQs, order status, returns, and escalations 24/7 — with zero wait time.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
  },
  {
    icon: CalendarCheck,
    title: 'Appointment Booking',
    description: 'Let patients, clients, or customers book, reschedule, and cancel without holding.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  {
    icon: PhoneCall,
    title: 'Sales Outreach',
    description: 'Qualify leads, schedule demos, and follow up at scale — without a call centre.',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10 border-violet-500/20',
  },
  {
    icon: HelpCircle,
    title: 'IT Help Desk',
    description: 'Resolve tickets, reset passwords, and guide users through issues instantly.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
]

const audiences = [
  { icon: Building2, title: 'Enterprise Teams', desc: 'Scale support without headcount. Integrate with your CRM, ERP, and ticketing tools via our API.' },
  { icon: Workflow,  title: 'Product Builders', desc: 'Embed voice AI in your SaaS. Our REST API and webhooks fit any stack in minutes.' },
  { icon: Globe,     title: 'Service Businesses', desc: 'Clinics, law firms, real estate agencies — automate inbound calls and bookings effortlessly.' },
]

const steps = [
  {
    step: '01', emoji: '🎨', title: 'Design Your Flow',
    description: 'Use our visual builder to create conversation flows. Add prompts, tools, conditions, and handoffs with simple drag-and-drop. No code required.',
    direction: 'left' as const,
  },
  {
    step: '02', emoji: '📚', title: 'Upload Your Knowledge',
    description: 'Upload PDFs and text files. Our hybrid search (BM25 + vector) automatically retrieves the most relevant context for every caller question.',
    direction: 'right' as const,
  },
  {
    step: '03', emoji: '🚀', title: 'Deploy & Monitor',
    description: 'Connect your Twilio number, go live in minutes, and monitor every call in real time — sentiment, cost, latency, all in one dashboard.',
    direction: 'left' as const,
  },
]

const stats = [
  { icon: Users,      label: 'Active Users',  rawValue: 10000, display: '10K+',  color: 'text-blue-400'    },
  { icon: PhoneCall,  label: 'Calls Handled', rawValue: 1000000, display: '1M+', color: 'text-emerald-400' },
  { icon: Clock,      label: 'Avg Response',  rawValue: null,  display: '< 2 s', color: 'text-amber-400'   },
  { icon: TrendingUp, label: 'Uptime',        rawValue: null,  display: '99.9%', color: 'text-violet-400'  },
]

const whyReasons = [
  'No ML expertise required — set up in 5 minutes',
  'Multi-model routing cuts costs by up to 70%',
  'Enterprise security out of the box',
  'Real-time analytics on every call',
  'Open REST API — integrate with anything',
  '1,000 free minutes to get started',
]

const testimonials = [
  {
    quote: 'Velox AI cut our support call volume by 60% in the first month. Setup was surprisingly easy.',
    author: 'Sarah K.',
    role: 'Head of Support, FinTech startup',
    stars: 5,
  },
  {
    quote: 'We replaced a 5-person call team with a single Velox agent. Customers can\'t tell the difference.',
    author: 'Marcus T.',
    role: 'Operations Director, Healthcare Group',
    stars: 5,
  },
  {
    quote: 'The flow builder is intuitive and the analytics are exactly what we needed to optimise our scripts.',
    author: 'Priya M.',
    role: 'Product Manager, E-commerce Platform',
    stars: 5,
  },
]

const models = [
  { model: 'Phi-3-mini SLM', tag: 'Fast',      desc: 'FAQs, yes/no, short answers — runs locally', border: 'border-emerald-500/40 bg-emerald-500/5', badge: 'bg-emerald-500/20 text-emerald-300' },
  { model: 'Gemini Flash',   tag: 'Balanced',   desc: 'Multi-turn, tool calling, reasoning',         border: 'border-blue-500/40 bg-blue-500/5',     badge: 'bg-blue-500/20 text-blue-300'     },
  { model: 'Gemini Pro',     tag: 'Powerful',   desc: 'Complex decisions, escalations',              border: 'border-violet-500/40 bg-violet-500/5', badge: 'bg-violet-500/20 text-violet-300' },
]

// ── Component ──────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('theme')
      if (saved) return saved === 'dark'
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    } catch { return true }
  })

  useEffect(() => {
    try { localStorage.setItem('theme', darkMode ? 'dark' : 'light') } catch { /* noop */ }
    document.documentElement.classList.toggle('light-mode', !darkMode)
  }, [darkMode])

  const bg = darkMode ? 'bg-slate-950 text-white' : 'bg-white text-slate-900'
  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
  const subText = darkMode ? 'text-slate-400' : 'text-slate-600'
  const navBg = darkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-white/90 border-slate-200'
  const btnGhost = darkMode
    ? 'text-slate-300 hover:text-white hover:bg-slate-800'
    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'

  return (
    <div className={`min-h-screen ${bg} transition-colors duration-300`}>

      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={`sticky top-0 z-50 border-b ${navBg} backdrop-blur`}
      >
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center group-hover:shadow-[0_0_14px_rgba(59,130,246,0.6)] transition-shadow duration-300">
              <Zap className="h-4.5 w-4.5 text-white" />
            </div>
            <span className={`text-xl font-bold group-hover:text-blue-400 transition-colors ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Velox AI
            </span>
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild className={btnGhost}>
              <Link to="/billing">Pricing</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className={btnGhost}>
              <Link to="/docs">
                <BookOpen className="h-4 w-4 mr-1.5" />
                Docs
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className={btnGhost}>
              <Link to="/dashboard">Sign In</Link>
            </Button>

            {/* Dark/Light toggle */}
            <button
              onClick={() => setDarkMode(d => !d)}
              className={`ml-1 h-8 w-8 rounded-lg flex items-center justify-center transition-all ${darkMode ? 'bg-slate-800 text-amber-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              aria-label="Toggle theme"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <Button size="sm" asChild className="ml-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-md shadow-blue-600/20">
              <Link to="/dashboard">Get Started Free</Link>
            </Button>
          </div>
        </div>
      </motion.nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-28 md:py-40">
        {/* Ambient glows */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <motion.div
            animate={{ scale: [1, 1.08, 1], opacity: [0.08, 0.14, 0.08] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -top-40 left-1/2 -translate-x-1/2 h-[700px] w-[1000px] rounded-full bg-blue-600/10 blur-3xl"
          />
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

            <motion.h1 variants={fadeInUp} className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight">
              <span className={darkMode ? 'text-white' : 'text-slate-900'}>Build AI Voice Agents</span>
              <span className="block bg-gradient-to-r from-blue-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent mt-2">
                In Minutes, Not Months
              </span>
            </motion.h1>

            <motion.p variants={fadeInUp} className={`text-xl ${subText} max-w-2xl mx-auto leading-relaxed`}>
              The no-code platform for creating intelligent AI voice agents. Handle customer
              calls, appointments, and support — powered by advanced RAG and multi-model routing.
            </motion.p>

            <motion.div variants={fadeInUp} className="flex flex-wrap gap-4 justify-center">
              <Button size="lg" asChild className="bg-blue-600 hover:bg-blue-500 text-white text-base px-8 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-shadow">
                <Link to="/dashboard">
                  Start Building Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild
                className={`${darkMode ? 'border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-100'} text-base px-8`}>
                <Link to="/docs">View Documentation</Link>
              </Button>
            </motion.div>

            <motion.div variants={fadeInUp} className={`flex flex-wrap items-center justify-center gap-6 text-sm ${subText}`}>
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

      {/* ── Stats with animated counters ───────────────────────────────────── */}
      <section className={`border-y ${darkMode ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-slate-50'} py-14`}>
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
                <div className={`text-3xl font-bold mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {s.rawValue ? <AnimatedCounter target={s.rawValue / 1000} suffix="K+" /> : s.display}
                </div>
                <div className={`text-sm ${subText}`}>{s.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── What is Velox AI ───────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="max-w-3xl mx-auto text-center"
          >
            <motion.div variants={fadeInUp}>
              <Badge className={`mb-4 ${darkMode ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30' : 'bg-emerald-100 text-emerald-700 border-emerald-300'}`}>
                What is Velox AI?
              </Badge>
            </motion.div>
            <motion.h2 variants={fadeInUp} className={`text-4xl font-bold mb-6 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Your AI-Powered Phone Team, Available 24/7
            </motion.h2>
            <motion.p variants={fadeInUp} className={`text-lg ${subText} leading-relaxed mb-8`}>
              Velox AI is a no-code platform that lets any business deploy intelligent voice agents on phone lines.
              You describe what your agent should do, upload your knowledge base, pick a voice, and go live — no
              developers needed. Your agent handles real calls with the same quality as a trained human representative,
              at a fraction of the cost.
            </motion.p>
            <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
              {[
                { icon: CheckCircle2, text: 'Understands natural language — no rigid menu trees' },
                { icon: CheckCircle2, text: 'Retrieves answers from your own documents in real-time' },
                { icon: CheckCircle2, text: 'Escalates to a human when it can\'t help' },
              ].map(({ icon: Icon, text }) => (
                <motion.div key={text} variants={scaleIn}
                  className={`flex items-start gap-3 p-4 rounded-xl border ${card}`}>
                  <Icon className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                  <p className={`text-sm ${subText}`}>{text}</p>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Who it's for ────────────────────────────────────────────────────── */}
      <section className={`py-20 ${darkMode ? 'bg-slate-900/40' : 'bg-slate-50'} border-y ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
        <div className="max-w-7xl mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="text-center mb-12"
          >
            <h2 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Built For Your Team</h2>
            <p className={`mt-3 ${subText}`}>Whether you're a Fortune 500 or a 3-person startup, Velox AI scales with you.</p>
          </motion.div>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid md:grid-cols-3 gap-6"
          >
            {audiences.map(({ icon: Icon, title, desc }) => (
              <motion.div key={title} variants={scaleIn}
                className={`p-6 rounded-2xl border ${card} hover:border-blue-500/40 transition-colors group`}>
                <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
                  <Icon className="h-6 w-6 text-blue-400" />
                </div>
                <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{title}</h3>
                <p className={`text-sm ${subText} leading-relaxed`}>{desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Key features ────────────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="text-center max-w-2xl mx-auto mb-16"
          >
            <h2 className={`text-4xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Everything You Need</h2>
            <p className={`text-xl ${subText}`}>
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
              <motion.div key={f.title} variants={scaleIn}
                whileHover={{ y: -4 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <div className={`h-full p-6 rounded-2xl border bg-gradient-to-br ${f.gradient} ${f.border} transition-all duration-300 hover:shadow-xl hover:shadow-black/30`}>
                  <f.icon className={`h-10 w-10 mb-4 ${f.iconColor}`} />
                  <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{f.title}</h3>
                  <p className={`text-sm ${subText} leading-relaxed`}>{f.description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Use cases ───────────────────────────────────────────────────────── */}
      <section className={`py-20 ${darkMode ? 'bg-slate-900/40' : 'bg-slate-50'} border-y ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
        <div className="max-w-7xl mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="text-center mb-12"
          >
            <h2 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Use Cases</h2>
            <p className={`mt-3 ${subText}`}>One platform. Endless applications.</p>
          </motion.div>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid md:grid-cols-2 lg:grid-cols-4 gap-5"
          >
            {useCases.map(({ icon: Icon, title, description, color, bg }) => (
              <motion.div key={title} variants={scaleIn}
                whileHover={{ scale: 1.03 }}
                className={`p-5 rounded-2xl border ${bg} cursor-default`}>
                <Icon className={`h-7 w-7 mb-3 ${color}`} />
                <h3 className={`font-semibold mb-1.5 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{title}</h3>
                <p className={`text-sm ${subText} leading-relaxed`}>{description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="text-center max-w-2xl mx-auto mb-16"
          >
            <h2 className={`text-4xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>How It Works</h2>
            <p className={`text-xl ${subText}`}>Get your AI voice agent answering real calls in three steps.</p>
          </motion.div>
          <div className="max-w-3xl mx-auto space-y-6">
            {steps.map((item, i) => (
              <motion.div
                key={item.step}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={i % 2 === 0 ? slideInLeft : slideInRight}
              >
                <div className={`p-8 rounded-2xl border ${card} hover:border-blue-500/30 transition-colors`}>
                  <div className="flex items-start gap-6">
                    <div className="text-5xl shrink-0">{item.emoji}</div>
                    <div className="flex-1">
                      <div className="text-xs font-mono text-blue-400 mb-2 tracking-widest uppercase">Step {item.step}</div>
                      <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{item.title}</h3>
                      <p className={`${subText} leading-relaxed`}>{item.description}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI Pipeline callout ─────────────────────────────────────────────── */}
      <section className={`py-20 ${darkMode ? 'bg-slate-900/40' : 'bg-slate-50'} border-y ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
        <div className="max-w-7xl mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className={`rounded-2xl border ${darkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'} p-10`}
          >
            <div className="grid md:grid-cols-2 gap-10 items-center">
              <div>
                <Badge className="bg-violet-600/20 text-violet-300 border-violet-500/30 mb-4">
                  Multi-Agent AI Pipeline
                </Badge>
                <h3 className={`text-3xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  The Right Model for Every Turn
                </h3>
                <p className={`${subText} mb-6 leading-relaxed`}>
                  Not every query needs top-tier compute. Our intelligent router uses Phi-3-mini
                  for simple FAQs, Gemini Flash for most conversations, and Gemini Pro only when
                  it truly matters — cutting costs by up to 70%.
                </p>
                <Button variant="outline" asChild className={`${darkMode ? 'border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}>
                  <Link to="/docs#pipeline">
                    Read the docs <ChevronRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <div className="space-y-3">
                {models.map((m) => (
                  <div key={m.model} className={`flex items-center justify-between p-4 rounded-xl border ${m.border}`}>
                    <div>
                      <div className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>{m.model}</div>
                      <div className={`text-xs ${subText} mt-0.5`}>{m.desc}</div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${m.badge}`}>{m.tag}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Why Choose Velox ────────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid md:grid-cols-2 gap-12 items-center"
          >
            <motion.div variants={slideInLeft}>
              <Badge className="bg-amber-600/20 text-amber-300 border-amber-500/30 mb-4">Why Velox AI?</Badge>
              <h2 className={`text-4xl font-bold mb-6 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                From Zero to Live in One Afternoon
              </h2>
              <p className={`${subText} leading-relaxed mb-8`}>
                Other platforms require ML engineers, custom training, and weeks of integration.
                Velox AI is designed for people who need results, not PhDs. Write a prompt, pick
                a voice, upload your docs, and go live — it's really that simple.
              </p>
              <ul className="space-y-3">
                {whyReasons.map((r) => (
                  <li key={r} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                    <span className={`text-sm ${subText}`}>{r}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
            <motion.div variants={slideInRight} className="space-y-4">
              {/* Quick comparison */}
              <div className={`p-6 rounded-2xl border ${card}`}>
                <p className={`text-xs font-mono uppercase tracking-widest mb-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Velox vs Traditional</p>
                <div className="space-y-3">
                  {[
                    ['Time to first call',  'Velox: 5 min',  'Others: 2–4 weeks'],
                    ['Developer required',  'Velox: No',      'Others: Yes'],
                    ['Cost per month',      'Velox: Pay per min', 'Others: $3K+ setup'],
                    ['ML expertise needed', 'Velox: None',    'Others: Required'],
                  ].map(([label, good, bad]) => (
                    <div key={label} className="grid grid-cols-3 gap-2 text-xs">
                      <span className={subText}>{label}</span>
                      <span className="text-emerald-400 font-medium">{good}</span>
                      <span className={`${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>{bad}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Testimonials ────────────────────────────────────────────────────── */}
      <section className={`py-20 ${darkMode ? 'bg-slate-900/40' : 'bg-slate-50'} border-y ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
        <div className="max-w-7xl mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="text-center mb-12"
          >
            <h2 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>What People Are Saying</h2>
          </motion.div>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid md:grid-cols-3 gap-6"
          >
            {testimonials.map((t) => (
              <motion.div key={t.author} variants={scaleIn}
                className={`p-6 rounded-2xl border ${card}`}>
                <div className="flex mb-3">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className={`text-sm ${subText} leading-relaxed mb-4 italic`}>"{t.quote}"</p>
                <div>
                  <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{t.author}</p>
                  <p className={`text-xs ${subText}`}>{t.role}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────────── */}
      <section className="py-24">
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
                Join thousands of companies using Velox AI to handle millions of conversations — 24/7, at a fraction of the cost.
              </p>
              <div className="relative flex flex-wrap gap-4 justify-center">
                <Button size="lg" asChild className="bg-blue-600 hover:bg-blue-500 text-white px-8 shadow-lg shadow-blue-600/30 text-base hover:shadow-blue-600/50 transition-shadow">
                  <Link to="/dashboard">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white px-8 text-base">
                  <Link to="/docs">Read the Docs</Link>
                </Button>
              </div>
              <p className="relative mt-6 text-sm text-slate-500">1,000 free minutes · No credit card required · Cancel anytime</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className={`border-t ${darkMode ? 'border-slate-800' : 'border-slate-200'} py-14`}>
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-10 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center">
                  <Zap className="h-3.5 w-3.5 text-white" />
                </div>
                <span className={`font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Velox AI</span>
              </div>
              <p className={`text-sm ${subText}`}>
                Enterprise AI voice agent platform — build, deploy, and scale.
              </p>
            </div>
            <div>
              <h4 className={`font-semibold mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>Product</h4>
              <ul className="space-y-2 text-sm">
                {[['Documentation', '/docs'], ['API Reference', '/docs#api'], ['Pricing', '/billing']].map(([l, to]) => (
                  <li key={l}><Link to={to} className={`${subText} hover:text-blue-400 transition-colors`}>{l}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className={`font-semibold mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>Platform</h4>
              <ul className="space-y-2 text-sm">
                {[['Agents', '/agents'], ['Knowledge Base', '/knowledge'], ['Call History', '/calls'], ['Dashboard', '/dashboard']].map(([l, to]) => (
                  <li key={l}><Link to={to} className={`${subText} hover:text-blue-400 transition-colors`}>{l}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className={`font-semibold mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>Legal</h4>
              <ul className="space-y-2 text-sm">
                {[['Privacy', '/privacy'], ['Terms', '/terms'], ['Security', '/security']].map(([l, to]) => (
                  <li key={l}><Link to={to} className={`${subText} hover:text-blue-400 transition-colors`}>{l}</Link></li>
                ))}
              </ul>
            </div>
          </div>
          <div className={`pt-8 border-t ${darkMode ? 'border-slate-800' : 'border-slate-200'} flex items-center justify-between`}>
            <p className={`text-sm ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
              © 2026 Velox AI. All rights reserved. Built with Gemini · Deepgram · Twilio · Google ADK
            </p>
            <button
              onClick={() => setDarkMode(d => !d)}
              className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-all ${darkMode ? 'border-slate-700 text-slate-500 hover:text-slate-300' : 'border-slate-300 text-slate-500 hover:text-slate-700'}`}
            >
              {darkMode ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
              {darkMode ? 'Light mode' : 'Dark mode'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}
