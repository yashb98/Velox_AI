// src/pages/AgentFlowBuilder.tsx
// Flow builder with auto-save (30s), manual save button, and save indicator.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { FlowEditor } from '@/components/flow/FlowEditor'
import { AgentFlow } from '@/types/flow'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Save, Loader2, CheckCircle2, AlertCircle, Bot } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export default function AgentFlowBuilder() {
  const { agentId } = useParams()
  const navigate = useNavigate()
  const [initialFlow, setInitialFlow] = useState<AgentFlow>()
  const [loading, setLoading] = useState(true)
  const [agentName, setAgentName] = useState<string>('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  // Keep latest flow in a ref so the auto-save interval can access it
  const latestFlowRef = useRef<AgentFlow | undefined>(undefined)

  useEffect(() => {
    if (agentId) loadAgentFlow()
    else setLoading(false)
  }, [agentId])

  // ── Auto-save every 30 seconds ─────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      if (isDirty && latestFlowRef.current && agentId) {
        await performSave(latestFlowRef.current, true)
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [isDirty, agentId])

  const loadAgentFlow = async () => {
    try {
      const { data: agent } = await api.get(`/api/agents/${agentId}`)
      setAgentName(agent.name ?? 'Agent')
      if (agent.llm_config?.flow) {
        setInitialFlow(agent.llm_config.flow)
        latestFlowRef.current = agent.llm_config.flow
      }
    } catch (err) {
      console.error('Failed to load agent flow:', err)
      toast.error('Failed to load agent flow')
    } finally {
      setLoading(false)
    }
  }

  const performSave = useCallback(async (flow: AgentFlow, silent = false) => {
    if (!agentId) return

    // Prevent saving empty flows
    if (!flow.nodes || flow.nodes.length === 0) {
      if (!silent) toast.error('Cannot save an empty flow — add at least one node first.')
      return
    }

    setSaveStatus('saving')
    try {
      await api.put(`/api/agents/${agentId}`, { llm_config: { flow } })
      setSaveStatus('saved')
      setLastSaved(new Date())
      setIsDirty(false)
      if (!silent) toast.success('Flow saved successfully!')
      // Reset to idle after 3s
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (err: any) {
      setSaveStatus('error')
      const msg = err?.response?.data?.error ?? 'Failed to save flow'
      toast.error(msg)
      setTimeout(() => setSaveStatus('idle'), 4000)
    }
  }, [agentId])

  const handleFlowChange = useCallback((flow: AgentFlow) => {
    latestFlowRef.current = flow
    setIsDirty(true)
  }, [])

  const handleSave = useCallback((flow: AgentFlow) => {
    latestFlowRef.current = flow
    performSave(flow, false)
  }, [performSave])

  // ── Save status label ──────────────────────────────────────────────────────
  function SaveIndicator() {
    if (saveStatus === 'saving') {
      return (
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Saving…
        </span>
      )
    }
    if (saveStatus === 'saved') {
      return (
        <span className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Saved {lastSaved ? `at ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>
      )
    }
    if (saveStatus === 'error') {
      return (
        <span className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5" />
          Save failed
        </span>
      )
    }
    if (isDirty) {
      return <span className="text-xs text-amber-400">● Unsaved changes</span>
    }
    if (lastSaved) {
      return (
        <span className="text-xs text-slate-500">
          Last saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400 mr-2" />
        <p className="text-slate-400">Loading flow…</p>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-950/95 backdrop-blur px-4 py-3 flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/agents')}
          className="text-slate-300 hover:text-white hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Agents
        </Button>

        <div className="h-4 w-px bg-slate-700" />

        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-blue-500/20 flex items-center justify-center">
            <Bot className="h-3.5 w-3.5 text-blue-400" />
          </div>
          <h1 className="text-sm font-semibold text-white">Flow Builder</h1>
          {agentName && (
            <Badge variant="outline" className="border-slate-700 text-slate-400 text-xs font-normal">
              {agentName}
            </Badge>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <SaveIndicator />
          <Button
            size="sm"
            onClick={() => latestFlowRef.current && handleSave(latestFlowRef.current)}
            disabled={saveStatus === 'saving'}
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            {saveStatus === 'saving' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            )}
            Save Flow
          </Button>
        </div>
      </div>

      {/* Flow Editor */}
      <div className="flex-1 overflow-hidden">
        <FlowEditor
          initialFlow={initialFlow}
          onSave={handleSave}
          onChange={handleFlowChange}
        />
      </div>
    </div>
  )
}
