// src/pages/Calls.tsx
// 5.5 — Calls page: paginated table of conversations with date range + status filters.
//        Uses TanStack Query for data fetching from GET /api/conversations.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Phone,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Search,
  Loader2,
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
  agent: { name: string }
  _count: { messages: number }
}

interface ApiResponse {
  conversations: Conversation[]
  pagination: { page: number; limit: number; total: number; pages: number }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function durationSecs(start: string, end: string | null): number {
  if (!end) return 0
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
}

function formatDuration(secs: number): string {
  if (secs === 0) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function Calls() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [agentIdFilter, setAgentIdFilter] = useState('')
  const LIMIT = 20

  const params = new URLSearchParams({
    page: String(page),
    limit: String(LIMIT),
  })
  if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter)
  if (agentIdFilter) params.set('agentId', agentIdFilter)

  const { data, isLoading, isError } = useQuery<ApiResponse>({
    queryKey: ['conversations', page, statusFilter, agentIdFilter],
    queryFn: () =>
      api.get<ApiResponse>(`/api/conversations?${params.toString()}`).then((r) => r.data),
    placeholderData: (prev) => prev, // keep old data while loading next page
  })

  const conversations = data?.conversations ?? []
  const pagination = data?.pagination

  function handleStatusChange(val: string) {
    setStatusFilter(val)
    setPage(1)
  }

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
            <Phone className="h-6 w-6 text-blue-400" />
            <h1 className="text-xl font-semibold text-white">Calls</h1>
          </div>
          <Button variant="ghost" size="sm" asChild
            className="text-slate-300 hover:text-white hover:bg-slate-800">
            <Link to="/dashboard">
              <LayoutDashboard className="h-4 w-4 mr-1" />
              Dashboard
            </Link>
          </Button>
        </div>
      </motion.header>

      <div className="container mx-auto px-6 py-8 space-y-6">
        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap gap-4 items-end"
        >
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
                <SelectItem value="ABANDONED">Abandoned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Agent ID</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 w-60"
                placeholder="Filter by agent ID…"
                value={agentIdFilter}
                onChange={(e) => {
                  setAgentIdFilter(e.target.value)
                  setPage(1)
                }}
              />
            </div>
          </div>

          {pagination && (
            <p className="text-sm text-muted-foreground ml-auto self-end">
              {pagination.total} conversations
            </p>
          )}
        </motion.div>

        {/* Table Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Conversation History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading && (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading…
                </div>
              )}
              {isError && (
                <p className="text-sm text-destructive py-8 text-center">
                  Failed to load calls.
                </p>
              )}
              {!isLoading && conversations.length === 0 && (
                <p className="text-sm text-muted-foreground py-12 text-center">
                  No calls found.
                </p>
              )}

              {conversations.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/30">
                      <tr>
                        {[
                          'Agent',
                          'Status',
                          'Started',
                          'Duration',
                          'Messages',
                          'Cost (min)',
                          'Sentiment',
                        ].map((h) => (
                          <th
                            key={h}
                            className="text-left px-4 py-3 font-medium text-muted-foreground text-xs"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {conversations.map((c) => (
                        <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-medium">{c.agent.name}</td>
                          <td className="px-4 py-3">
                            <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(c.start_time).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDuration(durationSecs(c.start_time, c.end_time))}
                          </td>
                          <td className="px-4 py-3 text-center">{c._count.messages}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {Number(c.cost_accrued).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {c.sentiment_score !== null ? (
                              <span
                                className={
                                  c.sentiment_score > 0.1
                                    ? 'text-green-600'
                                    : c.sentiment_score < -0.1
                                    ? 'text-red-500'
                                    : 'text-muted-foreground'
                                }
                              >
                                {c.sentiment_score > 0.1
                                  ? '😊'
                                  : c.sentiment_score < -0.1
                                  ? '😞'
                                  : '😐'}{' '}
                                {c.sentiment_score.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {pagination.page} of {pagination.pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
