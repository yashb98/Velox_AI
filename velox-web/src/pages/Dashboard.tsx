// src/pages/Dashboard.tsx
// 5.5 — Dashboard page: active calls, today's volume bar chart, recent conversations.
//        Uses TanStack Query for data fetching + recharts for the bar chart.

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Phone,
  PhoneCall,
  Users,
  Clock,
  TrendingUp,
  ArrowRight,
  Activity,
  LayoutDashboard,
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
    case 'ACTIVE':
      return 'default'
    case 'COMPLETED':
      return 'secondary'
    case 'FAILED':
    case 'ABANDONED':
      return 'destructive'
    default:
      return 'outline'
  }
}

/** Build a simple 24-hour call volume dataset from conversations */
function buildHourlyChart(conversations: Conversation[]) {
  const now = new Date()
  const today = now.toDateString()
  const buckets: Record<number, number> = {}
  for (let h = 0; h < 24; h++) buckets[h] = 0

  for (const c of conversations) {
    const d = new Date(c.start_time)
    if (d.toDateString() === today) {
      buckets[d.getHours()] = (buckets[d.getHours()] || 0) + 1
    }
  }

  return Object.entries(buckets).map(([hour, calls]) => ({
    hour: `${String(Number(hour)).padStart(2, '0')}:00`,
    calls,
  }))
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data, isLoading, isError } = useQuery<ConversationListResponse>({
    queryKey: ['conversations', 'dashboard'],
    queryFn: () =>
      api
        .get<ConversationListResponse>('/api/conversations?limit=100')
        .then((r) => r.data),
    refetchInterval: 30_000, // refresh every 30s to track active calls
  })

  const conversations = data?.conversations ?? []
  const total = data?.pagination.total ?? 0

  const active = conversations.filter((c) => c.status === 'ACTIVE').length
  const completed = conversations.filter((c) => c.status === 'COMPLETED').length
  const failed = conversations.filter(
    (c) => c.status === 'FAILED' || c.status === 'ABANDONED'
  ).length

  const todayCalls = conversations.filter(
    (c) => new Date(c.start_time).toDateString() === new Date().toDateString()
  ).length

  const hourlyData = buildHourlyChart(conversations)
  const recent = conversations.slice(0, 10)

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-b border-slate-800 bg-slate-950/95 backdrop-blur sticky top-0 z-10"
      >
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="h-6 w-6 text-blue-400" />
            <h1 className="text-xl font-semibold text-white">Dashboard</h1>
          </div>
          <nav className="flex items-center gap-2">
            {[
              { to: '/agents', label: 'Agents' },
              { to: '/calls', label: 'Calls' },
              { to: '/knowledge', label: 'Knowledge' },
              { to: '/billing', label: 'Billing' },
            ].map(({ to, label }) => (
              <Button key={to} variant="ghost" size="sm" asChild
                className="text-slate-300 hover:text-white hover:bg-slate-800">
                <Link to={to}>{label}</Link>
              </Button>
            ))}
          </nav>
        </div>
      </motion.header>

      <div className="container mx-auto px-6 py-8 space-y-8 text-slate-100">
        {/* Stat Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {[
            {
              label: 'Active Calls',
              value: active,
              icon: <PhoneCall className="h-5 w-5 text-primary" />,
              sub: 'Right now',
              highlight: active > 0,
            },
            {
              label: "Today's Calls",
              value: todayCalls,
              icon: <Phone className="h-5 w-5 text-primary" />,
              sub: 'Last 24 hours',
            },
            {
              label: 'Completed',
              value: completed,
              icon: <TrendingUp className="h-5 w-5 text-green-500" />,
              sub: 'Last 100 calls',
            },
            {
              label: 'Failed / Abandoned',
              value: failed,
              icon: <Activity className="h-5 w-5 text-red-500" />,
              sub: 'Last 100 calls',
            },
          ].map((stat) => (
            <Card
              key={stat.label}
              className={stat.highlight ? 'border-2 border-primary' : ''}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>{stat.label}</CardDescription>
                  {stat.icon}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {isLoading ? '—' : stat.value}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Hourly Bar Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Today's Call Volume
              </CardTitle>
              <CardDescription>Calls per hour (local time)</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground">
                  Loading…
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 10 }}
                      interval={3}
                      className="fill-muted-foreground"
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Conversations */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Recent Conversations
                </CardTitle>
                <CardDescription>
                  {total} total — showing latest {recent.length}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to="/calls" className="gap-1">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {isError && (
                <p className="text-sm text-destructive py-4">
                  Failed to load conversations.
                </p>
              )}
              {!isLoading && recent.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No conversations yet. Make your first call!
                </p>
              )}
              <div className="divide-y">
                {recent.map((c) => (
                  <div
                    key={c.id}
                    className="py-3 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {c.agent.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(c.start_time).toLocaleString()} ·{' '}
                        {durationLabel(c.start_time, c.end_time)} ·{' '}
                        {c._count.messages} messages
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {c.sentiment_score !== null && (
                        <span className="text-xs text-muted-foreground">
                          {c.sentiment_score > 0 ? '😊' : c.sentiment_score < 0 ? '😞' : '😐'}{' '}
                          {c.sentiment_score.toFixed(2)}
                        </span>
                      )}
                      <Badge variant={statusColor(c.status)}>
                        {c.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
