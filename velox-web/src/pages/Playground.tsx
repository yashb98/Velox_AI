// src/pages/Playground.tsx
// Per-agent playground chat page.
// Supports both real API agents AND the demo agent (id = "demo").
//
// Demo mode:
//  - Agent data loaded from localStorage (not from API)
//  - Responses simulated locally via simulateDemoResponse()
//  - Full conversation saved to localStorage under DEMO_CHAT_KEY
//  - A "Demo Mode" banner is shown so users know no real API calls are made
//
// Save conversation:
//  - Demo conversations auto-saved to localStorage after every message
//  - A "Save Chat" button persists the current chat to localStorage for any agent

import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChatMessage } from '@/components/playground/ChatMessage'
import { EnterpriseInput } from '@/components/playground/EnterpriseInput'
import { TutorialOverlay } from '@/components/playground/TutorialOverlay'
import { EnterpriseEmptyState } from '@/components/playground/EnterpriseEmptyState'
import { InspectorPanel } from '@/components/playground/InspectorPanel'
import { TypingIndicator } from '@/components/playground/TypingIndicator'
import {
  Trash2, Download, ArrowLeft, Play, Zap, Save, CheckCircle2,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import {
  isDemoAgentId,
  loadDemoAgent,
  simulateDemoResponse,
  DEMO_CHAT_KEY,
} from '@/lib/demoAgent'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: string
  latency?: number
  tokens?: number
}

// ── localStorage helpers for saving chat per agent ─────────────────────────────

function chatStorageKey(agentId: string) {
  return `velox_chat_${agentId}`
}

function loadSavedChat(agentId: string): Message[] {
  try {
    const key = isDemoAgentId(agentId) ? DEMO_CHAT_KEY : chatStorageKey(agentId)
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persistChat(agentId: string, messages: Message[]) {
  try {
    const key = isDemoAgentId(agentId) ? DEMO_CHAT_KEY : chatStorageKey(agentId)
    localStorage.setItem(key, JSON.stringify(messages))
  } catch { /* noop */ }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function Playground() {
  const { agentId } = useParams<{ agentId: string }>()
  const isDemo = isDemoAgentId(agentId)

  const [messages, setMessages] = useState<Message[]>(() =>
    agentId ? loadSavedChat(agentId) : []
  )
  const [loading, setLoading] = useState(false)
  const [agent, setAgent] = useState<any>(null)
  const [showTutorial, setShowTutorial] = useState(false)
  const [chatSaved, setChatSaved] = useState(false)
  const [metrics, setMetrics] = useState({
    totalTokens: 0,
    totalCost: 0,
    avgLatency: 0,
    connected: true,
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<Message[]>(messages)

  // Keep ref in sync
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem('playground_tutorial_completed')
    if (!hasSeenTutorial) setShowTutorial(true)

    if (agentId) loadAgentData()

    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        handleClearChat()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault()
        handleExportChat()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSaveChat()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [agentId])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Auto-save chat to localStorage on every message change
  useEffect(() => {
    if (agentId && messages.length > 0) {
      persistChat(agentId, messages)
    }
  }, [messages, agentId])

  const loadAgentData = useCallback(async () => {
    if (!agentId) return

    if (isDemo) {
      // Load demo agent from localStorage
      const demo = loadDemoAgent()
      if (demo) {
        setAgent({ ...demo, greeting: undefined })
      } else {
        toast.error('Demo agent not found. Run the tutorial first.')
      }
      return
    }

    try {
      const response = await api.get(`/api/agents/${agentId}`)
      setAgent(response.data)
      if (response.data.greeting && messages.length === 0) {
        setMessages([{
          id: '1',
          role: 'assistant',
          content: response.data.greeting,
          timestamp: new Date().toLocaleTimeString(),
        }])
      }
    } catch (error) {
      console.error('Failed to load agent:', error)
      toast.error('Failed to load agent')
      setMetrics(prev => ({ ...prev, connected: false }))
    }
  }, [agentId, isDemo])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSendMessage = async (content: string) => {
    const startTime = Date.now()
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date().toLocaleTimeString(),
    }

    setMessages((prev) => [...prev, userMessage])
    setLoading(true)

    try {
      if (isDemo) {
        // Simulate response locally for demo agent
        await new Promise(resolve => setTimeout(resolve, 700 + Math.random() * 400))
        const responseText = simulateDemoResponse(content)
        const latency = Date.now() - startTime
        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: responseText,
          timestamp: new Date().toLocaleTimeString(),
          latency,
          tokens: Math.floor(responseText.length / 4),
        }
        setMessages((prev) => [...prev, assistantMessage])
        setMetrics(prev => ({
          ...prev,
          totalTokens: prev.totalTokens + assistantMessage.tokens!,
          totalCost: prev.totalCost + (assistantMessage.tokens! * 0.00002),
          avgLatency: ((prev.avgLatency * (messagesRef.current.length - 1)) + latency) / messagesRef.current.length,
        }))
      } else {
        // Real API call
        const response = await api.post(`/api/playground/${agentId}/message`, {
          message: content,
          conversation_history: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
        })

        const { response: aiResponse, tool_calls, tokens = 0 } = response.data
        const latency = Date.now() - startTime

        if (tool_calls && tool_calls.length > 0) {
          for (const toolCall of tool_calls) {
            await new Promise(resolve => setTimeout(resolve, 300))
            const toolMessage: Message = {
              id: `tool-${Date.now()}-${Math.random()}`,
              role: 'tool',
              content: `${toolCall.name}(${JSON.stringify(toolCall.args, null, 2)})\n\nResult: ${JSON.stringify(toolCall.result, null, 2)}`,
              timestamp: new Date().toLocaleTimeString(),
            }
            setMessages((prev) => [...prev, toolMessage])
          }
        }

        await new Promise(resolve => setTimeout(resolve, 300))
        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: aiResponse,
          timestamp: new Date().toLocaleTimeString(),
          latency,
          tokens,
        }
        setMessages((prev) => [...prev, assistantMessage])
        setMetrics(prev => ({
          ...prev,
          totalTokens: prev.totalTokens + tokens,
          totalCost: prev.totalCost + (tokens * 0.00002),
          avgLatency: ((prev.avgLatency * messages.length) + latency) / (messages.length + 1),
        }))
      }
    } catch (error: any) {
      console.error('Failed to send message:', error)
      toast.error('Failed to send message')
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your message.',
        timestamp: new Date().toLocaleTimeString(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const handleSaveChat = () => {
    if (!agentId || messages.length === 0) {
      toast.error('No messages to save')
      return
    }
    persistChat(agentId, messages)
    setChatSaved(true)
    toast.success('Chat saved!')
    setTimeout(() => setChatSaved(false), 3000)
  }

  const handleClearChat = () => {
    if (messages.length === 0) return
    if (confirm('Clear conversation? This cannot be undone.')) {
      setMessages([])
      if (agentId) {
        const key = isDemoAgentId(agentId) ? DEMO_CHAT_KEY : chatStorageKey(agentId)
        localStorage.removeItem(key)
      }
      setMetrics({ totalTokens: 0, totalCost: 0, avgLatency: 0, connected: true })
      toast.success('Conversation cleared')
    }
  }

  const handleExportChat = () => {
    if (messages.length === 0) {
      toast.error('No messages to export')
      return
    }
    const chatData = JSON.stringify(messages, null, 2)
    const blob = new Blob([chatData], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chat-${agentId}-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported successfully')
  }

  const handleTemplateSelect = (template: any) => {
    handleSendMessage(template.prompt)
  }

  const handleTutorialComplete = () => {
    localStorage.setItem('playground_tutorial_completed', 'true')
    toast.success('Ready to test!')
  }

  const handleTutorialSkip = () => {
    localStorage.setItem('playground_tutorial_completed', 'true')
  }

  return (
    <>
      {showTutorial && (
        <TutorialOverlay
          onComplete={handleTutorialComplete}
          onSkip={handleTutorialSkip}
        />
      )}

      <div className="h-screen flex flex-col bg-slate-950">
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <motion.header
          id="playground-header"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="h-14 border-b border-slate-800 bg-slate-950/95 backdrop-blur px-6 flex items-center justify-between shrink-0"
        >
          {/* Left */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild className="h-8 text-slate-300 hover:text-white hover:bg-slate-800">
              <Link to="/playground" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm font-medium">Back</span>
              </Link>
            </Button>
            <div className="h-4 w-px bg-slate-700" />
            <div className="flex items-center gap-2">
              <Play className="h-4 w-4 text-blue-400" />
              <h1 className="text-sm font-semibold text-white">Playground</h1>
            </div>
            {/* Demo badge */}
            {isDemo && (
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs gap-1.5">
                <Sparkles className="h-3 w-3" />
                Demo Mode
              </Badge>
            )}
          </div>

          {/* Right */}
          <div className="flex items-center gap-2" id="action-buttons">
            {agent && (
              <Badge variant="outline" className="gap-1 font-normal border-slate-700 text-slate-300">
                <Zap className="h-3 w-3" />
                {agent.name}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSaveChat}
              disabled={messages.length === 0}
              className="h-8 text-slate-300 hover:text-white hover:bg-slate-800"
              title="Save chat (⌘S)"
            >
              {chatSaved ? (
                <CheckCircle2 className="h-4 w-4 mr-1.5 text-emerald-400" />
              ) : (
                <Save className="h-4 w-4 mr-1.5" />
              )}
              {chatSaved ? 'Saved!' : 'Save'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportChat}
              disabled={messages.length === 0}
              className="h-8 text-slate-300 hover:text-white hover:bg-slate-800"
            >
              <Download className="h-4 w-4 mr-1.5" />
              Export
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearChat}
              disabled={messages.length === 0}
              className="h-8 text-slate-300 hover:text-white hover:bg-slate-800"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Clear
            </Button>
          </div>
        </motion.header>

        {/* ── Demo notice banner ─────────────────────────────────────────────── */}
        {isDemo && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 flex items-center gap-2 shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">
              <strong>Demo Mode:</strong> Responses are simulated locally — no real API calls are made.
              Conversations are saved automatically to your browser.
            </p>
          </div>
        )}

        {/* ── Main workspace ──────────────────────────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden bg-slate-950">
          {/* Chat area */}
          <div className="flex-1 flex flex-col relative">
            <div className="flex-1 overflow-y-auto px-6">
              <AnimatePresence mode="wait">
                {messages.length === 0 ? (
                  <EnterpriseEmptyState
                    key="empty"
                    onTemplateSelect={handleTemplateSelect}
                  />
                ) : (
                  <motion.div
                    key="messages"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="max-w-4xl mx-auto py-8 space-y-6"
                  >
                    {messages.map((message, index) => (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                      >
                        <ChatMessage
                          role={message.role}
                          content={message.content}
                          timestamp={message.timestamp}
                          latency={message.latency}
                          tokens={message.tokens}
                        />
                      </motion.div>
                    ))}
                    <AnimatePresence>
                      {loading && <TypingIndicator key="typing" />}
                    </AnimatePresence>
                    <div ref={messagesEndRef} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Input bar */}
            <div className="px-6 pb-8">
              <div className="max-w-4xl mx-auto">
                <EnterpriseInput
                  onSend={handleSendMessage}
                  disabled={loading}
                  showSuggestions={messages.length === 0}
                />
              </div>
            </div>
          </div>

          {/* Inspector panel */}
          <InspectorPanel
            agent={agent}
            messages={messages}
            metrics={metrics}
          />
        </div>
      </div>
    </>
  )
}
