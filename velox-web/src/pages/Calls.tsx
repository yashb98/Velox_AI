// src/pages/Calls.tsx
// Calls page: paginated table of conversations with date range + status filters.
// Uses TanStack Query for data fetching from GET /api/conversations.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  Search,
  Loader2,
  Clock,
  MessageSquare,
  TrendingUp,
  AlertCircle,
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

function statusColor(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'COMPLETED':
      return 'bg-stone-100 text-stone-700 border-stone-200'
    case 'FAILED':
    case 'ABANDONED':
      return 'bg-red-100 text-red-700 border-red-200'
    default:
      return 'bg-stone-100 text-stone-600 border-stone-200'
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
    placeholderData: (prev) => prev,
  })

  const conversations = data?.conversations ?? []
  const pagination = data?.pagination

  function handleStatusChange(val: string) {
    setStatusFilter(val)
    setPage(1)
  }

  // Calculate stats
  const totalCalls = pagination?.total ?? 0
  const avgDuration = conversations.length > 0
    ? Math.round(conversations.reduce((sum, c) => sum + durationSecs(c.start_time, c.end_time), 0) / conversations.length)
    : 0
  const avgMessages = conversations.length > 0
    ? Math.round(conversations.reduce((sum, c) => sum + c._count.messages, 0) / conversations.length)
    : 0

  return (
    <div className="min-h-screen bg-[#faf9f7]">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-b border-stone-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10"
      >
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <Phone className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-stone-900">Calls</h1>
              <p className="text-xs text-stone-500">View and analyze your conversation history</p>
            </div>
          </div>
          <Badge variant="outline" className="border-stone-300 text-stone-600 text-xs">
            {totalCalls} total calls
          </Badge>
        </div>
      </motion.header>

      <div className="container mx-auto px-6 py-8 space-y-6">
        {/* Stats Cards */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          <Card className="bg-white border-stone-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Phone className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-stone-900">{totalCalls}</p>
                  <p className="text-xs text-stone-500">Total Calls</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white border-stone-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-stone-900">{formatDuration(avgDuration)}</p>
                  <p className="text-xs text-stone-500">Avg Duration</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white border-stone-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-stone-900">{avgMessages}</p>
                  <p className="text-xs text-stone-500">Avg Messages</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-wrap gap-4 items-end"
        >
          <div className="space-y-1.5">
            <Label className="text-stone-700 text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-40 bg-white border-stone-300 text-stone-900">
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
            <Label className="text-stone-700 text-xs">Agent ID</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <Input
                className="pl-9 w-60 bg-white border-stone-300 text-stone-900 placeholder:text-stone-400"
                placeholder="Filter by agent ID…"
                value={agentIdFilter}
                onChange={(e) => {
                  setAgentIdFilter(e.target.value)
                  setPage(1)
                }}
              />
            </div>
          </div>
        </motion.div>

        {/* Table Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="bg-white border-stone-200">
            <CardHeader className="border-b border-stone-100">
              <CardTitle className="text-stone-900 text-base">Conversation History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading && (
                <div className="flex items-center justify-center py-16 text-stone-500">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading…
                </div>
              )}
              {isError && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
                    <AlertCircle className="h-6 w-6 text-red-600" />
                  </div>
                  <p className="text-sm text-red-600 font-medium">Failed to load calls</p>
                  <p className="text-xs text-stone-500 mt-1">Please try again later</p>
                </div>
              )}
              {!isLoading && conversations.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="h-16 w-16 rounded-2xl bg-stone-100 flex items-center justify-center mb-4">
                    <Phone className="h-8 w-8 text-stone-400" />
                  </div>
                  <p className="text-stone-900 font-medium">No calls found</p>
                  <p className="text-sm text-stone-500 mt-1">Calls will appear here once agents start taking them</p>
                </div>
              )}

              {conversations.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-stone-100 bg-stone-50/50">
                      <tr>
                        {[
                          'Agent',
                          'Status',
                          'Started',
                          'Duration',
                          'Messages',
                          'Cost',
                          'Sentiment',
                        ].map((h) => (
                          <th
                            key={h}
                            className="text-left px-4 py-3 font-medium text-stone-500 text-xs"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {conversations.map((c) => (
                        <tr key={c.id} className="hover:bg-stone-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-stone-900">{c.agent.name}</td>
                          <td className="px-4 py-3">
                            <Badge className={`${statusColor(c.status)} text-xs`}>{c.status}</Badge>
                          </td>
                          <td className="px-4 py-3 text-stone-600">
                            {new Date(c.start_time).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-stone-600">
                            {formatDuration(durationSecs(c.start_time, c.end_time))}
                          </td>
                          <td className="px-4 py-3 text-center text-stone-600">{c._count.messages}</td>
                          <td className="px-4 py-3 text-stone-600">
                            ${Number(c.cost_accrued).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {c.sentiment_score !== null ? (
                              <span className="flex items-center justify-center gap-1">
                                {c.sentiment_score > 0.1 ? (
                                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                                ) : c.sentiment_score < -0.1 ? (
                                  <TrendingUp className="h-3.5 w-3.5 text-red-500 rotate-180" />
                                ) : null}
                                <span
                                  className={
                                    c.sentiment_score > 0.1
                                      ? 'text-emerald-600'
                                      : c.sentiment_score < -0.1
                                      ? 'text-red-500'
                                      : 'text-stone-500'
                                  }
                                >
                                  {c.sentiment_score.toFixed(2)}
                                </span>
                              </span>
                            ) : (
                              <span className="text-stone-400">—</span>
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-center justify-center gap-4"
          >
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="border-stone-300 text-stone-700 hover:bg-stone-100"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-stone-600">
              Page {pagination.page} of {pagination.pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
              className="border-stone-300 text-stone-700 hover:bg-stone-100"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  )
}
