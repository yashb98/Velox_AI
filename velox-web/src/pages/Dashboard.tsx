// src/pages/Dashboard.tsx
// Enhanced dashboard: agent stats + call metrics, charts, quick actions, filters.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Phone, PhoneCall, TrendingUp, ArrowRight, Activity,
  Bot, Plus, Play, BarChart3, CheckCircle2, XCircle,
  Clock, Loader2, Zap, Users,
} from 'lucide-react'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Conversation {
  id: string
  status: string
  start_time: string
  end_time: string | null
  cost_accrued: number
  sentiment_score: number | null
  agent_id: string
  agent: { name: string }
  _count: { messages: number }
}

interface ConversationListResponse {
  conversations: Conversation[]
  pagination: { page: number; limit: number; total: number; pages: number }
}

interface Agent {
  id: string
  name: string
  is_active: boolean
  voice_id: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function durationLabel(start: string, end: string | null): string {
  if (!end) return 'In progress'
  const secs = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function statusColor(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'ACTIVE': return 'default'
    case 'COMPLETED': return 'secondary'
    case 'FAILED': case 'ABANDONED': return 'destructive'
    default: return 'outline'
  }
}

function buildHourlyChart(conversations: Conversation[]) {
  const today = new Date().toDateString()
  const buckets: Record<number, number> = {}
  for (let h = 0; h < 24; h++) buckets[h] = 0
  for (const c of conversations) {
    const d = new Date(c.start_time)
    if (d.toDateString() === today) buckets[d.getHours()]++
  }
  return Object.entries(buckets).map(([hour, calls]) => ({
    hour: `${String(Number(hour)).padStart(2, '0')}:00`,
    calls,
  }))
}

function buildWeeklyChart(conversations: Conversation[]) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const buckets: Record<string, number> = {}
  days.forEach(d => { buckets[d] = 0 })
  for (const c of conversations) {
    const d = days[new Date(c.start_time).getDay()]
    buckets[d]++
  }
  return days.map(d => ({ day: d, calls: buckets[d] }))
}

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444']

// ── Animation ─────────────────────────────────────────────────────────────────
const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.4 } }) }

// ── Component ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [range, setRange] = useState<'today' | 'week' | 'all'>('today')

  const { data: convData, isLoading: loadingConvs, isError: errConvs } = useQuery<ConversationListResponse>({
    queryKey: ['conversations', 'dashboard'],
    queryFn: () => api.get<ConversationListResponse>('/api/conversations?limit=200').then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: agentsData, isLoading: loadingAgents } = useQuery<{ agents: Agent[]; total: number }>({
    queryKey: ['agents'],
    queryFn: () => api.get<{ agents: Agent[]; total: number }>('/api/agents').then(r => r.data),
    refetchInterval: 60_000,
  })

  const conversations = convData?.conversations ?? []
  const agents = agentsData?.agents ?? []
  const totalAgents = agents.length
  const activeAgents = agents.filter(a => a.is_active).length

  const active = conversations.filter(c => c.status === 'ACTIVE').length
  const completed = conversations.filter(c => c.status === 'COMPLETED').length
  const failed = conversations.filter(c => c.status === 'FAILED' || c.status === 'ABANDONED').length
  const total = convData?.pagination.total ?? 0

  const todayCalls = conversations.filter(
    c => new Date(c.start_time).toDateString() === new Date().toDateString()
  ).length

  // Avg duration of completed calls
  const completedCalls = conversations.filter(c => c.status === 'COMPLETED' && c.end_time)
  const avgDuration = completedCalls.length > 0
    ? Math.round(completedCalls.reduce((acc, c) => {
        const secs = (new Date(c.end_time!).getTime() - new Date(c.start_time).getTime()) / 1000
        return acc + secs
      }, 0) / completedCalls.length)
    : 0
  const avgDurationLabel = avgDuration > 0
    ? `${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s`
    : '—'

  // Success rate
  const successRate = (completed + failed) > 0
    ? Math.round((completed / (completed + failed)) * 100)
    : null

  const hourlyData = buildHourlyChart(conversations)
  const weeklyData = buildWeeklyChart(conversations)
  const recent = conversations.slice(0, 12)

  // Agent usage distribution for pie
  const agentUsage = agents.map(a => ({
    name: a.name,
    value: conversations.filter(c => c.agent_id === a.id).length,
  })).filter(a => a.value > 0)

  // Status distribution
  const statusPie = [
    { name: 'Completed', value: completed },
    { name: 'Active', value: active },
    { name: 'Failed', value: failed },
  ].filter(s => s.value > 0)

  const isLoading = loadingConvs || loadingAgents

  return (
    <div className="min-h-full bg-slate-950">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-800 bg-slate-950/95 backdrop-blur sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">Dashboard</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {isLoading ? 'Loading…' : `${total} total conversations · refreshes every 30s`}
            </p>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost"
              className="text-slate-300 hover:text-white hover:bg-slate-800"
              asChild>
              <Link to="/agents">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New Agent
              </Link>
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white" asChild>
              <Link to="/agents">
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Open Playground
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="px-6 py-8 space-y-8">
        {/* Error banner */}
        {errConvs && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400 flex items-center gap-2">
            <XCircle className="h-4 w-4 shrink-0" />
            Failed to load dashboard data. Check your API connection.
          </div>
        )}

        {/* ── Stat cards ───────────────────────────────────────────────────── */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
          initial="hidden"
          animate="visible"
        >
          {[
            {
              label: 'Total Agents',
              value: isLoading ? null : totalAgents,
              sub: `${activeAgents} active`,
              icon: <Bot className="h-5 w-5 text-blue-400" />,
              accent: 'border-blue-500/20',
            },
            {
              label: 'Active Calls',
              value: isLoading ? null : active,
              sub: 'Right now',
              icon: <PhoneCall className="h-5 w-5 text-emerald-400" />,
              accent: active > 0 ? 'border-emerald-500 bg-emerald-500/5' : 'border-slate-800',
            },
            {
              label: "Today's Calls",
              value: isLoading ? null : todayCalls,
              sub: 'Last 24 hours',
              icon: <Phone className="h-5 w-5 text-violet-400" />,
              accent: 'border-slate-800',
            },
            {
              label: 'Success Rate',
              value: isLoading ? null : (successRate !== null ? `${successRate}%` : '—'),
              sub: `${completed} completed · ${failed} failed`,
              icon: <TrendingUp className="h-5 w-5 text-amber-400" />,
              accent: 'border-slate-800',
            },
          ].map((stat, i) => (
            <motion.div key={stat.label} custom={i} variants={fadeUp}>
              <Card className={`bg-slate-900 ${stat.accent} transition-colors h-full`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="text-slate-400 text-xs">{stat.label}</CardDescription>
                    {stat.icon}
                  </div>
                </CardHeader>
                <CardContent>
                  {stat.value === null ? (
                    <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
                  ) : (
                    <p className="text-3xl font-bold text-white">{stat.value}</p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">{stat.sub}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Secondary stats ──────────────────────────────────────────────── */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
          initial="hidden"
          animate="visible"
        >
          {[
            {
              label: 'Avg Call Duration',
              value: isLoading ? null : avgDurationLabel,
              icon: <Clock className="h-4 w-4 text-slate-400" />,
            },
            {
              label: 'Completed Calls',
              value: isLoading ? null : completed,
              icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
            },
            {
              label: 'Failed / Abandoned',
              value: isLoading ? null : failed,
              icon: <XCircle className="h-4 w-4 text-red-400" />,
            },
            {
              label: 'Total Messages',
              value: isLoading ? null : conversations.reduce((s, c) => s + c._count.messages, 0),
              icon: <Users className="h-4 w-4 text-blue-400" />,
            },
          ].map((s, i) => (
            <motion.div key={s.label} custom={i + 4} variants={fadeUp}>
              <Card className="bg-slate-900 border-slate-800 py-3">
                <CardContent className="pt-0 pb-0 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                    {s.icon}
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{s.label}</p>
                    {s.value === null ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-600 mt-0.5" />
                    ) : (
                      <p className="text-lg font-semibold text-white">{s.value}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Charts row ───────────────────────────────────────────────────── */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Today's hourly call volume */}
          <motion.div
            className="md:col-span-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="bg-slate-900 border-slate-800 h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-white text-sm">
                      <BarChart3 className="h-4 w-4 text-blue-400" />
                      Call Volume
                    </CardTitle>
                    <CardDescription className="text-slate-500 text-xs">Today — calls per hour</CardDescription>
                  </div>
                  {/* Range filter */}
                  <div className="flex gap-1">
                    {(['today', 'week', 'all'] as const).map(r => (
                      <button
                        key={r}
                        onClick={() => setRange(r)}
                        className={`text-xs px-2 py-1 rounded-md transition-colors ${
                          range === r
                            ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {r === 'today' ? 'Today' : r === 'week' ? 'Week' : 'All'}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-48 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    {range === 'week' ? (
                      <LineChart data={weeklyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#f1f5f9' }}
                        />
                        <Line dataKey="calls" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} />
                      </LineChart>
                    ) : (
                      <BarChart data={hourlyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#64748b' }} interval={3} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#f1f5f9' }}
                        />
                        <Bar dataKey="calls" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Status distribution pie */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="bg-slate-900 border-slate-800 h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white text-sm">
                  <Activity className="h-4 w-4 text-violet-400" />
                  Status Breakdown
                </CardTitle>
                <CardDescription className="text-slate-500 text-xs">All-time call outcomes</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-48 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
                  </div>
                ) : statusPie.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-slate-600 text-sm">
                    No data yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={false}>
                        {statusPie.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        formatter={(value) => <span style={{ color: '#94a3b8', fontSize: 11 }}>{value}</span>}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#f1f5f9' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* ── Agent usage + Recent conversations ───────────────────────────── */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Agent usage */}
          {agentUsage.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white text-sm">
                    <Bot className="h-4 w-4 text-blue-400" />
                    Agent Usage
                  </CardTitle>
                  <CardDescription className="text-slate-500 text-xs">Calls per agent</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {agentUsage.map((a, i) => (
                    <div key={a.name} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300 truncate max-w-[120px]">{a.name}</span>
                        <span className="text-slate-500">{a.value}</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.round((a.value / Math.max(...agentUsage.map(x => x.value))) * 100)}%` }}
                          transition={{ delay: 0.4 + i * 0.05, duration: 0.5 }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Recent conversations */}
          <motion.div
            className={agentUsage.length > 0 ? 'md:col-span-2' : 'md:col-span-3'}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-white text-sm">
                    <Zap className="h-4 w-4 text-amber-400" />
                    Recent Conversations
                  </CardTitle>
                  <CardDescription className="text-slate-500 text-xs">
                    {total} total · showing latest {recent.length}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild
                  className="border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800">
                  <Link to="/calls" className="gap-1">
                    View all <ArrowRight className="h-3 w-3" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {errConvs && (
                  <p className="text-sm text-red-400 py-4">Failed to load conversations.</p>
                )}
                {!isLoading && recent.length === 0 && (
                  <div className="text-center py-8 space-y-2">
                    <Phone className="h-8 w-8 text-slate-700 mx-auto" />
                    <p className="text-sm text-slate-600">No conversations yet.</p>
                    <p className="text-xs text-slate-700">Create an agent and test it in the Playground!</p>
                  </div>
                )}
                <div className="divide-y divide-slate-800">
                  {recent.map((c) => (
                    <div key={c.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-white truncate">{c.agent.name}</p>
                          {c.sentiment_score !== null && (
                            <span className="text-xs">
                              {c.sentiment_score > 0 ? '😊' : c.sentiment_score < 0 ? '😞' : '😐'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          {new Date(c.start_time).toLocaleString()} · {durationLabel(c.start_time, c.end_time)} · {c._count.messages} messages
                        </p>
                      </div>
                      <Badge variant={statusColor(c.status)} className="shrink-0 text-xs">
                        {c.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* ── Quick actions strip ───────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="bg-gradient-to-r from-blue-600/10 via-violet-600/10 to-emerald-600/10 border-slate-800">
            <CardContent className="py-5 flex flex-wrap gap-3 items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Quick Actions</p>
                <p className="text-xs text-slate-500">Jump straight to common tasks</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Create Agent', icon: Plus, to: '/agents', primary: true },
                  { label: 'View Analytics', icon: BarChart3, to: '/calls' },
                  { label: 'Knowledge Base', icon: Users, to: '/knowledge' },
                  { label: 'Billing', icon: TrendingUp, to: '/billing' },
                ].map(({ label, icon: Icon, to, primary }) => (
                  <Button
                    key={label}
                    size="sm"
                    variant={primary ? 'default' : 'outline'}
                    asChild
                    className={primary
                      ? 'bg-blue-600 hover:bg-blue-500 text-white'
                      : 'border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'}
                  >
                    <Link to={to}>
                      <Icon className="h-3.5 w-3.5 mr-1.5" />
                      {label}
                    </Link>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
