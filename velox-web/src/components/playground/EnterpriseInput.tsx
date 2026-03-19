// src/components/playground/EnterpriseInput.tsx

import { useState, useRef, KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Paperclip, Settings2, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface EnterpriseInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  showSuggestions?: boolean
}

const templates = [
  "Check order status for #12345",
  "What products are in stock?",
  "Help me with a return request",
  "Show me your capabilities",
]

export function EnterpriseInput({ onSend, disabled, showSuggestions }: EnterpriseInputProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSend(message.trim())
      setMessage('')
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="space-y-3" id="chat-input">
      {/* Contextual Chips - Fade after first message */}
      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            id="message-suggestions"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap gap-2"
          >
            {templates.map((template, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
              >
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 transition-colors font-normal text-stone-600 border-stone-300"
                  onClick={() => {
                    setMessage(template)
                    textareaRef.current?.focus()
                  }}
                >
                  <Sparkles className="h-3 w-3 mr-1.5 text-amber-500" />
                  {template}
                </Badge>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Input Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-stone-200 rounded-xl shadow-lg hover:shadow-xl transition-shadow"
      >
        <div className="flex items-end gap-3 p-4">
          {/* Toolbar Icons */}
          <div className="flex gap-1 mb-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-stone-400 hover:text-stone-600 hover:bg-stone-100"
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-stone-400 hover:text-stone-600 hover:bg-stone-100"
              title="Settings"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Rich Text Input */}
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your test scenario..."
            disabled={disabled}
            className="flex-1 min-h-[48px] max-h-[200px] resize-none border-0 shadow-none focus-visible:ring-0 text-sm bg-transparent text-stone-900 placeholder:text-stone-400"
          />

          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={disabled || !message.trim()}
            size="icon"
            className="h-10 w-10 shrink-0 rounded-lg bg-amber-600 hover:bg-amber-500 text-white"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {/* Helper Text */}
        <div className="px-4 pb-3 flex items-center justify-between text-xs text-stone-500">
          <span>Enter to send · Shift+Enter for new line</span>
          {message.length > 0 && (
            <span className="text-stone-400">{message.length} characters</span>
          )}
        </div>
      </motion.div>
    </div>
  )
}
