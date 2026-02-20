// src/components/playground/InspectorPanel.tsx
// Rebuilt: full dark theme (slate-900 panel), inline help text on every metric,
// clearer section labels, and explanatory empty states.

import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { useState } from 'react'
import {
  Activity,
  Cpu,
  DollarSign,
  Clock,
  Zap,
  Settings,
  Terminal,
  Circle,
  Info,
} from 'lucide-react'

interface InspectorPanelProps {
  agent: any
  messages: any[]
  metrics: {
    totalTokens: number
    totalCost: number
    avgLatency: number
    connected: boolean
  }
}

// ── Tiny inline tooltip ─────────────────────────────────────────────────────────

function MetricHelp({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block ml-1">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="text-slate-600 hover:text-slate-400 transition-colors"
        aria-label="What is this?"
      >
        <Info className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-1.5 z-50 w-48 bg-slate-800 border border-slate-700 rounded-lg p-2 shadow-xl pointer-events-none">
          <p className="text-xs text-slate-300 leading-relaxed">{text}</p>
          <div className="absolute right-2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-700" />
        </div>
      )}
    </span>
  )
}

export function InspectorPanel({ agent, messages, metrics }: InspectorPanelProps) {
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(2048)

  const toolCalls = messages.filter((m) => m.role === 'tool').length

  const eventLog = messages.slice(-5).map((msg) => ({
    time: msg.timestamp,
    event:
      msg.role === 'user'
        ? 'User message'
        : msg.role === 'tool'
        ? 'Tool executed'
        : 'AI response',
    details:
      msg.role === 'tool'
        ? msg.content.split('(')[0]
        : msg.content.substring(0, 40) + (msg.content.length > 40 ? '…' : ''),
    color:
      msg.role === 'user'
        ? 'text-blue-400'
        : msg.role === 'tool'
        ? 'text-violet-400'
        : 'text-emerald-400',
  }))

  return (
    <motion.aside
      id="sidebar"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="w-80 border-l border-slate-800 bg-slate-900 overflow-y-auto"
    >
      <div className="p-5 space-y-5">

        {/* ── Connection status ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Circle
                className={`h-2 w-2 fill-current ${
                  metrics.connected ? 'text-emerald-400' : 'text-red-400'
                }`}
              />
            </motion.div>
            <span className="text-xs text-slate-400 font-medium">
              {metrics.connected ? 'Connected to API' : 'Disconnected'}
            </span>
          </div>
          {agent && (
            <Badge
              variant="outline"
              className="border-slate-700 text-slate-400 text-xs font-normal"
            >
              {agent.name}
            </Badge>
          )}
        </div>

        <Separator className="bg-slate-800" />

        {/* ── Configuration ─────────────────────────────────────────────────────── */}
        <Card className="border-slate-800 bg-slate-900/50" id="config-card">
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-xs font-semibold text-slate-300 flex items-center gap-2 uppercase tracking-wide">
              <Settings className="h-3.5 w-3.5 text-slate-500" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            {agent ? (
              <>
                {/* Model */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Model</span>
                  <Badge variant="outline" className="font-mono text-xs border-slate-700 text-slate-300">
                    Gemini 2.5 Flash
                  </Badge>
                </div>

                <Separator className="bg-slate-800" />

                {/* Temperature */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-400">Temperature</span>
                      <MetricHelp text="Controls creativity. Lower (0.0) = more predictable and factual. Higher (2.0) = more creative and varied." />
                    </div>
                    <span className="text-xs font-mono text-white">{temperature}</span>
                  </div>
                  <Slider
                    value={[temperature]}
                    onValueChange={(v) => setTemperature(v[0])}
                    min={0}
                    max={2}
                    step={0.1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-slate-600">
                    <span>Precise</span>
                    <span>Creative</span>
                  </div>
                </div>

                {/* Max Tokens */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-400">Max Tokens</span>
                      <MetricHelp text="Maximum length of each AI response. 1 token ≈ 4 characters. 256 = short. 4096 = very long." />
                    </div>
                    <span className="text-xs font-mono text-white">{maxTokens}</span>
                  </div>
                  <Slider
                    value={[maxTokens]}
                    onValueChange={(v) => setMaxTokens(v[0])}
                    min={256}
                    max={4096}
                    step={256}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-slate-600">
                    <span>Short</span>
                    <span>Long</span>
                  </div>
                </div>

                <Separator className="bg-slate-800" />

                {/* Enabled Tools */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400">Enabled Tools</span>
                    <MetricHelp text="Tools the agent can call during conversations — e.g. order lookup, calendar booking, CRM search." />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {agent.tools_enabled && agent.tools_enabled.length > 0 ? (
                      agent.tools_enabled.map((tool: string) => (
                        <Badge
                          key={tool}
                          variant="secondary"
                          className="text-xs font-normal bg-slate-800 text-slate-300 border-slate-700"
                        >
                          {tool}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-xs text-slate-600 italic">
                        No tools enabled — add tools in the agent's settings.
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-600 text-center py-4 italic">
                No agent loaded. Navigate here from an agent card.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Live Metrics ──────────────────────────────────────────────────────── */}
        <Card className="border-slate-800 bg-slate-900/50" id="stats-card">
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-xs font-semibold text-slate-300 flex items-center gap-2 uppercase tracking-wide">
              <Activity className="h-3.5 w-3.5 text-slate-500" />
              Live Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1">
            {[
              {
                icon: Activity,
                label: 'Messages',
                value: messages.length,
                help: 'Total number of turns in this conversation (user + assistant + tool).',
              },
              {
                icon: Clock,
                label: 'Avg Latency',
                value: metrics.avgLatency > 0 ? `${metrics.avgLatency.toFixed(0)}ms` : '—',
                help: 'Average time from sending a message to receiving the first token of the response.',
              },
              {
                icon: Cpu,
                label: 'Total Tokens',
                value: metrics.totalTokens.toLocaleString(),
                help: 'Cumulative tokens used across all turns. 1 token ≈ 4 characters of English text.',
              },
              {
                icon: DollarSign,
                label: 'Est. Cost',
                value: `$${metrics.totalCost.toFixed(4)}`,
                help: 'Estimated API cost for this session based on token usage. Actual billing may vary.',
              },
              {
                icon: Zap,
                label: 'Tool Calls',
                value: toolCalls,
                help: 'Number of times the agent invoked an external tool (e.g. CRM lookup, calendar booking).',
              },
            ].map(({ icon: Icon, label, value, help }) => (
              <div
                key={label}
                className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-slate-500" />
                  <span className="text-xs text-slate-400">{label}</span>
                  <MetricHelp text={help} />
                </div>
                <span className="text-sm font-mono font-semibold text-white">
                  {value}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── Event Log ────────────────────────────────────────────────────────── */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-xs font-semibold text-slate-300 flex items-center gap-2 uppercase tracking-wide">
              <Terminal className="h-3.5 w-3.5 text-slate-500" />
              Event Log
              <span className="text-[10px] text-slate-600 font-normal normal-case">
                (last 5)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {eventLog.length === 0 ? (
              <p className="text-xs text-slate-600 text-center py-4 italic">
                Events appear here as you chat. Send a message to get started.
              </p>
            ) : (
              <div className="space-y-2">
                {[...eventLog].reverse().map((event, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-xs font-mono border-l-2 border-slate-800 pl-2"
                  >
                    <div className={`font-semibold ${event.color}`}>{event.event}</div>
                    <div className="text-slate-600 text-[10px] truncate">{event.details}</div>
                    <div className="text-slate-700 text-[10px]">{event.time}</div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── System Prompt ─────────────────────────────────────────────────────── */}
        {agent && (
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                System Prompt
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xs text-slate-500 bg-slate-950 border border-slate-800 p-3 rounded-lg font-mono max-h-36 overflow-y-auto leading-relaxed">
                {agent.system_prompt || (
                  <span className="text-slate-700 italic">No system prompt configured.</span>
                )}
              </div>
              <p className="text-[10px] text-slate-700 mt-1.5">
                Edit this in the Agents page → Edit → System Prompt field.
              </p>
            </CardContent>
          </Card>
        )}

      </div>
    </motion.aside>
  )
}
