// src/pages/PlaygroundHub.tsx
// Top-level Playground page accessible from the sidebar.
// Shows an agent picker first, then launches the full chat interface.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Bot,
  Play,
  Search,
  Loader2,
  Zap,
  Phone,
  Mic2,
  ChevronRight,
  X,
  AlertCircle,
} from 'lucide-react'
import api from '@/lib/api'

interface Agent {
  id: string
  name: string
  phone_number: string | null
  voice_id: string
  system_prompt: string
  is_active: boolean
  _count?: { conversations: number }
}

export default function PlaygroundHub() {
  const [search, setSearch] = useState('')

  const { data: agents = [], isLoading, isError, refetch } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: () =>
      api
        .get<{ agents: Agent[]; total: number }>('/api/agents')
        .then((r) => r.data.agents ?? []),
  })

  const filtered = agents.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-b border-slate-800 bg-slate-950/95 backdrop-blur sticky top-0 z-10"
      >
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Play className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Playground</h1>
              <p className="text-xs text-slate-500">Select an agent to start a test conversation</p>
            </div>
          </div>
          <Badge variant="outline" className="border-slate-700 text-slate-400 text-xs">
            {agents.length} agent{agents.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </motion.div>

      <div className="container mx-auto px-6 py-8 max-w-4xl">
        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents…"
            className="pl-9 bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading agents…
          </div>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <div className="text-center py-16 space-y-3">
            <div className="h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
              <AlertCircle className="h-6 w-6 text-red-400" />
            </div>
            <p className="text-white font-medium">Failed to load agents</p>
            <p className="text-sm text-slate-500">Check your connection and try again.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="border-slate-700 text-slate-300 hover:text-white"
            >
              Retry
            </Button>
          </div>
        )}

        {/* Empty state — no agents */}
        {!isLoading && !isError && agents.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16"
          >
            <div className="h-16 w-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-4">
              <Bot className="h-8 w-8 text-slate-500" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">No agents yet</h2>
            <p className="text-sm text-slate-500 mb-5">
              Create an agent first, then come back to test it here.
            </p>
            <Button asChild className="bg-blue-600 hover:bg-blue-500 text-white">
              <Link to="/agents">
                <Bot className="h-4 w-4 mr-2" />
                Go to Agents
              </Link>
            </Button>
          </motion.div>
        )}

        {/* No search results */}
        {!isLoading && !isError && agents.length > 0 && filtered.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <Search className="h-8 w-8 mx-auto mb-3 text-slate-700" />
            <p className="text-sm">No agents match "{search}"</p>
          </div>
        )}

        {/* Agent grid */}
        <AnimatePresence mode="popLayout">
          <div className="grid sm:grid-cols-2 gap-4">
            {filtered.map((agent, i) => (
              <motion.div
                key={agent.id}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.04 }}
              >
                <Link
                  to={`/agents/${agent.id}/playground`}
                  className="group block h-full"
                >
                  <div className="h-full bg-slate-900 border border-slate-800 rounded-xl p-5 transition-all duration-200 hover:border-blue-500/50 hover:bg-slate-800/80 hover:shadow-lg hover:shadow-blue-900/20">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center ring-1 ring-blue-500/20 shrink-0">
                          <Bot className="h-5 w-5 text-blue-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-white text-sm leading-tight">
                            {agent.name}
                          </p>
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <Phone className="h-3 w-3" />
                            {agent.phone_number || <span className="italic">No phone</span>}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={agent.is_active ? 'default' : 'outline'}
                        className={
                          agent.is_active
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs shrink-0'
                            : 'border-slate-700 text-slate-500 text-xs shrink-0'
                        }
                      >
                        {agent.is_active ? '● Live' : '○ Off'}
                      </Badge>
                    </div>

                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4">
                      {agent.system_prompt || (
                        <span className="italic text-slate-600">No system prompt</span>
                      )}
                    </p>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Mic2 className="h-3 w-3" />
                        {agent.voice_id}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-blue-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        <Zap className="h-3 w-3" />
                        Launch
                        <ChevronRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>

        {/* Help footer */}
        {!isLoading && agents.length > 0 && (
          <p className="text-xs text-slate-600 text-center mt-8">
            Click an agent card to open a live test conversation.
            Changes in the Playground do not affect live calls.
          </p>
        )}
      </div>
    </div>
  )
}
