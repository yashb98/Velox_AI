// src/pages/Agents.tsx
// 5.5 — Agents list page: create / edit agents via a side drawer.
//        Uses TanStack Query for data fetching from GET /api/agents.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Bot,
  Plus,
  Phone,
  Workflow,
  PlayCircle,
  LayoutDashboard,
  Pencil,
  X,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Agent {
  id: string
  name: string
  phone_number: string | null
  voice_id: string
  system_prompt: string
  is_active: boolean
  org_id: string
  _count?: { conversations: number }
}

interface AgentForm {
  name: string
  phone_number: string
  voice_id: string
  system_prompt: string
}

const DEFAULT_FORM: AgentForm = {
  name: '',
  phone_number: '',
  voice_id: 'aura-asteria-en',
  system_prompt: 'You are a helpful assistant. Keep answers concise and friendly.',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Agents() {
  const qc = useQueryClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<Agent | null>(null)
  const [form, setForm] = useState<AgentForm>(DEFAULT_FORM)

  // Fetch agents
  const { data: agents = [], isLoading } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: () => api.get<Agent[]>('/api/agents').then((r) => r.data),
  })

  // Create mutation
  const createMut = useMutation({
    mutationFn: (body: AgentForm) =>
      api.post<Agent>('/api/agents', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] })
      toast.success('Agent created')
      closeDrawer()
    },
    onError: () => toast.error('Failed to create agent'),
  })

  // Update mutation
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<AgentForm> }) =>
      api.patch<Agent>(`/api/agents/${id}`, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] })
      toast.success('Agent updated')
      closeDrawer()
    },
    onError: () => toast.error('Failed to update agent'),
  })

  function openCreate() {
    setEditing(null)
    setForm(DEFAULT_FORM)
    setDrawerOpen(true)
  }

  function openEdit(agent: Agent) {
    setEditing(agent)
    setForm({
      name: agent.name,
      phone_number: agent.phone_number ?? '',
      voice_id: agent.voice_id,
      system_prompt: agent.system_prompt,
    })
    setDrawerOpen(true)
  }

  function closeDrawer() {
    setDrawerOpen(false)
    setEditing(null)
    setForm(DEFAULT_FORM)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editing) {
      updateMut.mutate({ id: editing.id, body: form })
    } else {
      createMut.mutate(form)
    }
  }

  const isSaving = createMut.isPending || updateMut.isPending

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-b bg-background/95 backdrop-blur sticky top-0 z-10"
      >
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bot className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">Agents</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/dashboard">
                <LayoutDashboard className="h-4 w-4 mr-1" />
                Dashboard
              </Link>
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              New Agent
            </Button>
          </div>
        </div>
      </motion.header>

      <div className="container mx-auto px-6 py-8">
        {isLoading && (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading agents…
          </div>
        )}

        {!isLoading && agents.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-24"
          >
            <Bot className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-40" />
            <h2 className="text-xl font-semibold mb-2">No agents yet</h2>
            <p className="text-muted-foreground mb-6">
              Create your first voice AI agent to start handling calls.
            </p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Agent
            </Button>
          </motion.div>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent, i) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="h-full hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{agent.name}</CardTitle>
                        <CardDescription className="text-xs flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3" />
                          {agent.phone_number || 'No phone assigned'}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant={agent.is_active ? 'default' : 'outline'}>
                      {agent.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {agent.system_prompt}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Voice: {agent.voice_id}</span>
                    {agent._count && (
                      <>
                        <span>·</span>
                        <span>{agent._count.conversations} calls</span>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={() => openEdit(agent)}>
                      <Pencil className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/agents/${agent.id}/flow`}>
                        <Workflow className="h-3 w-3 mr-1" />
                        Flow
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/agents/${agent.id}/playground`}>
                        <PlayCircle className="h-3 w-3 mr-1" />
                        Test
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Side Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeDrawer}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="relative w-full max-w-md bg-background border-l shadow-xl flex flex-col"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">
                {editing ? 'Edit Agent' : 'New Agent'}
              </h2>
              <Button variant="ghost" size="icon" onClick={closeDrawer}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Drawer Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="name">Agent Name *</Label>
                <Input
                  id="name"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Support Agent, Sales Bot"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={form.phone_number}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone_number: e.target.value }))
                  }
                  placeholder="+1 555 000 0000"
                />
                <p className="text-xs text-muted-foreground">
                  Twilio number to assign to this agent
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="voice">Voice ID</Label>
                <Input
                  id="voice"
                  value={form.voice_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, voice_id: e.target.value }))
                  }
                  placeholder="aura-asteria-en or el_XXXX for ElevenLabs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prompt">System Prompt *</Label>
                <Textarea
                  id="prompt"
                  required
                  rows={8}
                  value={form.system_prompt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, system_prompt: e.target.value }))
                  }
                  placeholder="You are a helpful assistant…"
                  className="resize-none"
                />
              </div>

              <Button type="submit" className="w-full" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving…
                  </>
                ) : editing ? (
                  'Save Changes'
                ) : (
                  'Create Agent'
                )}
              </Button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  )
}
