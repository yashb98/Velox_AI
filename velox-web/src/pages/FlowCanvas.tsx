// src/pages/FlowCanvas.tsx
// Standalone top-level Flow Canvas page — accessible from sidebar at /flow.
//
// Features:
//  • Create named flows, save/load via localStorage
//  • Full ReactFlow canvas: drag-drop nodes, connect edges, mini-map, controls
//  • Sidebar panel: flow list (create, rename, delete, load)
//  • Node types: Start, Prompt, Tool, Condition, Handoff, End
//  • Auto-save on change (debounced 1.5s) + manual Save button
//  • Save status indicator

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  Edge,
  NodeTypes,
  Panel,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  GitBranch,
  Plus,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  PlayCircle,
  MessageSquare,
  Wrench,
  PhoneForwarded,
  StopCircle,
  Pencil,
  Check,
  X,
  ChevronRight,
  ChevronLeft,
  FolderOpen,
} from 'lucide-react'
import { toast } from 'sonner'
import { nodeTypes } from '@/components/flow/nodes'
import { NodePropertiesPanel } from '@/components/flow/NodePropertiesPanel'
import { AgentFlow } from '@/types/flow'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SavedFlow {
  id: string
  name: string
  updatedAt: string
  flow: AgentFlow
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// ── Persistence helpers ────────────────────────────────────────────────────────

const STORAGE_KEY = 'velox_flows'

function loadFlows(): SavedFlow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persistFlows(flows: SavedFlow[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flows))
  } catch { /* noop */ }
}

// ── Default starter flow ───────────────────────────────────────────────────────

function starterFlow(): AgentFlow {
  return {
    nodes: [
      {
        id: 'start-1',
        type: 'start',
        position: { x: 240, y: 80 },
        data: { label: 'Start', greeting: 'Hello! How can I help you today?' },
      },
    ],
    edges: [],
  }
}

// ── Node type button config ────────────────────────────────────────────────────

const NODE_BUTTONS = [
  { type: 'start',     label: 'Start',     icon: PlayCircle,     color: 'text-emerald-400' },
  { type: 'prompt',    label: 'Prompt',    icon: MessageSquare,  color: 'text-blue-400'    },
  { type: 'tool',      label: 'Tool',      icon: Wrench,         color: 'text-purple-400'  },
  { type: 'condition', label: 'Condition', icon: GitBranch,      color: 'text-amber-400'   },
  { type: 'handoff',   label: 'Handoff',   icon: PhoneForwarded, color: 'text-orange-400'  },
  { type: 'end',       label: 'End',       icon: StopCircle,     color: 'text-red-400'     },
]

// ── Component ──────────────────────────────────────────────────────────────────

export default function FlowCanvas() {
  // ── Flow list state ──────────────────────────────────────────────────────────
  const [flows, setFlows] = useState<SavedFlow[]>(loadFlows)
  const [activeId, setActiveId] = useState<string | null>(() => {
    const saved = loadFlows()
    return saved.length > 0 ? saved[0].id : null
  })
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingNameVal, setEditingNameVal] = useState('')

  // ── Canvas state ─────────────────────────────────────────────────────────────
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  // Debounce auto-save ref
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestFlowRef = useRef<AgentFlow>({ nodes: [], edges: [] })

  // ── Load active flow into canvas ──────────────────────────────────────────────
  useEffect(() => {
    if (!activeId) {
      setNodes([])
      setEdges([])
      return
    }
    const found = loadFlows().find((f) => f.id === activeId)
    if (found) {
      setNodes(found.flow.nodes as any)
      setEdges(found.flow.edges as any)
      latestFlowRef.current = found.flow
      setIsDirty(false)
      setSaveStatus('idle')
    }
  }, [activeId])

  // ── Save helpers ──────────────────────────────────────────────────────────────
  const doSave = useCallback(
    (flow: AgentFlow, silent = false) => {
      if (!activeId) return
      setSaveStatus('saving')
      const allFlows = loadFlows()
      const idx = allFlows.findIndex((f) => f.id === activeId)
      if (idx === -1) { setSaveStatus('error'); return }

      const updated = {
        ...allFlows[idx],
        flow,
        updatedAt: new Date().toISOString(),
      }
      const next = [...allFlows]
      next[idx] = updated
      persistFlows(next)
      setFlows(next)
      setSaveStatus('saved')
      setLastSaved(new Date())
      setIsDirty(false)
      if (!silent) toast.success('Flow saved!')
      setTimeout(() => setSaveStatus('idle'), 3000)
    },
    [activeId]
  )

  // ── Notify canvas changes ─────────────────────────────────────────────────────
  const notifyChange = useCallback(
    (updatedNodes: typeof nodes, updatedEdges: typeof edges) => {
      const flow: AgentFlow = {
        nodes: updatedNodes as AgentFlow['nodes'],
        edges: updatedEdges as AgentFlow['edges'],
      }
      latestFlowRef.current = flow
      setIsDirty(true)

      // Debounced auto-save (1.5 s after last change)
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = setTimeout(() => doSave(flow, true), 1500)
    },
    [doSave]
  )

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes)
      // Use functional setter to read latest values
      setNodes((nds) => {
        notifyChange(nds, edges)
        return nds
      })
    },
    [onNodesChange, edges, notifyChange, setNodes]
  )

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes)
      setEdges((eds) => {
        notifyChange(nodes, eds)
        return eds
      })
    },
    [onEdgesChange, nodes, notifyChange, setEdges]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        const next = addEdge(connection, eds)
        notifyChange(nodes, next)
        return next
      })
    },
    [setEdges, nodes, notifyChange]
  )

  // ── Add node ──────────────────────────────────────────────────────────────────
  const addNode = useCallback(
    (type: string) => {
      if (!activeId) {
        toast.error('Select or create a flow first.')
        return
      }
      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position: { x: 200 + Math.random() * 200, y: 100 + nodes.length * 90 },
        data: { label: `New ${type}` },
      }
      setNodes((nds) => {
        const next: Node[] = [...nds, newNode]
        notifyChange(next, edges)
        return next
      })
    },
    [activeId, nodes.length, edges, setNodes, notifyChange]
  )

  // ── Node interaction ──────────────────────────────────────────────────────────
  const onNodeClick = useCallback((_: any, node: Node) => setSelectedNode(node), [])
  const onPaneClick = useCallback(() => setSelectedNode(null), [])

  const updateNodeData = useCallback(
    (nodeId: string, data: any) => {
      setNodes((nds) => {
        const next: Node[] = nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
        )
        notifyChange(next, edges)
        return next
      })
    },
    [setNodes, edges, notifyChange]
  )

  // ── Flow list management ──────────────────────────────────────────────────────
  function createFlow() {
    const id = `flow-${Date.now()}`
    const name = `Flow ${flows.length + 1}`
    const newFlow: SavedFlow = {
      id,
      name,
      updatedAt: new Date().toISOString(),
      flow: starterFlow(),
    }
    const next = [newFlow, ...flows]
    persistFlows(next)
    setFlows(next)
    setActiveId(id)
    toast.success(`"${name}" created`)
  }

  function deleteFlow(id: string) {
    if (!confirm('Delete this flow? This cannot be undone.')) return
    const next = flows.filter((f) => f.id !== id)
    persistFlows(next)
    setFlows(next)
    if (activeId === id) {
      setActiveId(next.length > 0 ? next[0].id : null)
    }
    toast.success('Flow deleted')
  }

  function startRename(f: SavedFlow) {
    setEditingNameId(f.id)
    setEditingNameVal(f.name)
  }

  function commitRename(id: string) {
    const trimmed = editingNameVal.trim()
    if (!trimmed) { setEditingNameId(null); return }
    const next = flows.map((f) => f.id === id ? { ...f, name: trimmed } : f)
    persistFlows(next)
    setFlows(next)
    setEditingNameId(null)
    toast.success('Renamed')
  }

  // ── Save status label ─────────────────────────────────────────────────────────
  function SaveIndicator() {
    if (saveStatus === 'saving')
      return (
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…
        </span>
      )
    if (saveStatus === 'saved')
      return (
        <span className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Saved {lastSaved ? `at ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>
      )
    if (saveStatus === 'error')
      return (
        <span className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5" />Save failed
        </span>
      )
    if (isDirty)
      return <span className="text-xs text-amber-400">● Unsaved changes</span>
    if (lastSaved)
      return (
        <span className="text-xs text-slate-500">
          Last saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )
    return null
  }

  const activeFlow = flows.find((f) => f.id === activeId)

  return (
    <div className="h-screen flex flex-col bg-slate-950 overflow-hidden">

      {/* ── Top header ────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-b border-slate-800 bg-slate-950/95 backdrop-blur px-4 py-3 flex items-center gap-4 shrink-0 z-10"
      >
        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="text-slate-400 hover:text-white transition-colors"
          title={sidebarOpen ? 'Hide flows panel' : 'Show flows panel'}
        >
          {sidebarOpen ? (
            <ChevronLeft className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
        </button>

        <div className="h-4 w-px bg-slate-700" />

        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-violet-500/20 flex items-center justify-center">
            <GitBranch className="h-3.5 w-3.5 text-violet-400" />
          </div>
          <h1 className="text-sm font-semibold text-white">Flow Builder</h1>
          {activeFlow && (
            <Badge
              variant="outline"
              className="border-slate-700 text-slate-400 text-xs font-normal"
            >
              {activeFlow.name}
            </Badge>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <SaveIndicator />
          <Button
            size="sm"
            onClick={() => doSave(latestFlowRef.current, false)}
            disabled={saveStatus === 'saving' || !activeId}
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            {saveStatus === 'saving' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            )}
            Save
          </Button>
        </div>
      </motion.div>

      {/* ── Body ──────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar: flows list ─────────────────────────────────────────── */}
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 240, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="border-r border-slate-800 bg-slate-900/60 flex flex-col shrink-0 overflow-hidden"
              style={{ minWidth: 0 }}
            >
              <div className="p-3 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Flows
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={createFlow}
                  className="h-7 px-2 text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  New
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto py-1.5 space-y-0.5 px-1.5">
                {flows.length === 0 && (
                  <div className="text-center py-8 px-3">
                    <FolderOpen className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-xs text-slate-500">No flows yet.</p>
                    <button
                      onClick={createFlow}
                      className="mt-2 text-xs text-blue-400 hover:text-blue-300 underline"
                    >
                      Create your first flow
                    </button>
                  </div>
                )}

                {flows.map((f) => (
                  <div
                    key={f.id}
                    onClick={() => setActiveId(f.id)}
                    className={`
                      group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all
                      ${activeId === f.id
                        ? 'bg-blue-600/20 border border-blue-500/30'
                        : 'hover:bg-slate-800/70 border border-transparent'}
                    `}
                  >
                    <GitBranch
                      className={`h-3.5 w-3.5 shrink-0 ${
                        activeId === f.id ? 'text-blue-400' : 'text-slate-500'
                      }`}
                    />

                    {editingNameId === f.id ? (
                      <form
                        onSubmit={(e) => { e.preventDefault(); commitRename(f.id) }}
                        className="flex-1 flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Input
                          autoFocus
                          value={editingNameVal}
                          onChange={(e) => setEditingNameVal(e.target.value)}
                          className="h-6 text-xs bg-slate-800 border-slate-600 text-white px-1.5 flex-1"
                        />
                        <button type="submit" className="text-emerald-400 hover:text-emerald-300">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingNameId(null)}
                          className="text-slate-500 hover:text-slate-300"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    ) : (
                      <>
                        <span
                          className={`flex-1 text-xs truncate ${
                            activeId === f.id ? 'text-white font-medium' : 'text-slate-300'
                          }`}
                        >
                          {f.name}
                        </span>
                        <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); startRename(f) }}
                            className="p-0.5 text-slate-500 hover:text-slate-300 rounded"
                            title="Rename"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteFlow(f.id) }}
                            className="p-0.5 text-slate-500 hover:text-red-400 rounded"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Node type palette */}
              <div className="border-t border-slate-800 p-3">
                <p className="text-xs text-slate-500 mb-2 font-medium">Add Node</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {NODE_BUTTONS.map(({ type, label, icon: Icon, color }) => (
                    <button
                      key={type}
                      onClick={() => addNode(type)}
                      disabled={!activeId}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-slate-700 text-xs text-slate-300 hover:border-slate-500 hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Icon className={`h-3 w-3 ${color}`} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ── Canvas area ───────────────────────────────────────────────────────── */}
        <div className="flex-1 relative overflow-hidden">
          {!activeId ? (
            /* Empty state — no flow selected */
            <div className="h-full flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center max-w-sm px-6"
              >
                <div className="h-16 w-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-4">
                  <GitBranch className="h-8 w-8 text-slate-500" />
                </div>
                <h2 className="text-lg font-semibold text-white mb-2">
                  No flow selected
                </h2>
                <p className="text-sm text-slate-500 mb-5">
                  Create a new flow or select one from the panel to start building.
                </p>
                <Button
                  onClick={createFlow}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Flow
                </Button>
              </motion.div>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes as unknown as NodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              deleteKeyCode="Delete"
              className="bg-slate-950"
            >
              <Background color="#334155" gap={20} size={1} />
              <Controls className="!bg-slate-900 !border-slate-700 !shadow-xl" />
              <MiniMap
                className="!bg-slate-900 !border-slate-700"
                nodeColor={() => '#3b82f6'}
                maskColor="rgba(2,6,23,0.7)"
              />

              {/* Keyboard shortcut hint */}
              <Panel position="bottom-center">
                <div className="bg-slate-900/80 backdrop-blur border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-500 flex items-center gap-3">
                  <span>🖱 Drag to pan</span>
                  <span>⚙ Click node to configure</span>
                  <span>⌦ Delete key removes node</span>
                  <span>🔗 Drag port → port to connect</span>
                </div>
              </Panel>
            </ReactFlow>
          )}
        </div>

        {/* ── Right: Node properties panel ──────────────────────────────────────── */}
        {selectedNode && (
          <NodePropertiesPanel
            node={selectedNode}
            onUpdate={(data) => updateNodeData(selectedNode.id, data)}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  )
}
