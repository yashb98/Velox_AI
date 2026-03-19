// src/pages/Knowledge.tsx
// Company Documents hub - central place for policies, guidelines, and FAQs.
// All agents use these documents to answer questions accurately.

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  FileText,
  Upload,
  Loader2,
  Check,
  Bot,
  File,
  FileType,
  AlertCircle,
  FolderOpen,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface KnowledgeBase {
  id: string
  name: string
  _count?: { chunks: number }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Knowledge() {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadResult, setUploadResult] = useState<{ chunks: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // Fetch knowledge bases
  const { data: kbs = [], isLoading } = useQuery<KnowledgeBase[]>({
    queryKey: ['knowledge-bases'],
    queryFn: () =>
      api.get<KnowledgeBase[]>('/api/agents/knowledge-bases').then((r) => r.data).catch(() => []),
  })

  // Get default KB (or first one)
  const defaultKb = kbs[0]
  const totalChunks = kbs.reduce((sum, kb) => sum + (kb._count?.chunks ?? 0), 0)

  // Upload mutation
  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      if (!defaultKb) throw new Error('No knowledge base available')
      const form = new FormData()
      form.append('file', file)
      form.append('kb_id', defaultKb.id)
      const res = await api.post<{ status: string; chunks: number }>(
        '/api/documents/upload',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      return res.data
    },
    onSuccess: (data) => {
      setUploadResult({ chunks: data.chunks })
      qc.invalidateQueries({ queryKey: ['knowledge-bases'] })
      toast.success(`Document uploaded: ${data.chunks} sections indexed`)
    },
    onError: () => toast.error('Upload failed'),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadResult(null)
    uploadMut.mutate(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file && (file.type === 'application/pdf' || file.name.endsWith('.txt'))) {
      uploadMut.mutate(file)
    } else {
      toast.error('Please upload a PDF or TXT file')
    }
  }

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
            <FileText className="h-6 w-6 text-amber-600" />
            <div>
              <h1 className="text-xl font-semibold text-stone-900">Company Documents</h1>
              <p className="text-xs text-stone-500">Policies, guidelines, and FAQs for your agents</p>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs">
            {totalChunks} sections indexed
          </Badge>
        </div>
      </motion.header>

      <div className="container mx-auto px-6 py-8 max-w-4xl space-y-8">
        {/* Info Banner */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-4 p-4 rounded-xl bg-amber-50 border border-amber-200"
        >
          <Bot className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">
              Your agents learn from these documents
            </p>
            <p className="text-sm text-amber-700 mt-1">
              Upload company policies, product FAQs, support guidelines, and other reference materials.
              All your AI agents will use this information to answer customer questions accurately.
            </p>
          </div>
        </motion.div>

        {/* Upload Panel */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-2 border-dashed border-amber-300 bg-amber-50/50">
            <CardContent className="p-8">
              <div
                className={`flex flex-col items-center justify-center text-center transition-colors rounded-xl p-8 ${
                  dragOver ? 'bg-amber-100' : ''
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <div className="h-16 w-16 rounded-2xl bg-amber-100 flex items-center justify-center mb-4">
                  <Upload className="h-8 w-8 text-amber-600" />
                </div>
                <h3 className="text-lg font-semibold text-stone-900 mb-2">
                  Upload Company Documents
                </h3>
                <p className="text-sm text-stone-600 mb-4 max-w-md">
                  Drag and drop files here, or click to browse.
                  Supports PDF and TXT files.
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt"
                  className="hidden"
                  onChange={handleFileChange}
                />

                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMut.isPending || !defaultKb}
                  className="bg-amber-600 hover:bg-amber-500 text-white"
                >
                  {uploadMut.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Processing…
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Choose File
                    </>
                  )}
                </Button>

                {uploadResult && (
                  <div className="flex items-center gap-2 mt-4 text-sm text-emerald-600">
                    <Check className="h-4 w-4" />
                    <span>Successfully indexed {uploadResult.chunks} sections</span>
                  </div>
                )}

                {!defaultKb && !isLoading && (
                  <div className="flex items-center gap-2 mt-4 text-sm text-amber-700">
                    <AlertCircle className="h-4 w-4" />
                    <span>Create an agent first to enable document uploads</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Document Types Guide */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-lg font-semibold text-stone-900 mb-4">What to Upload</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              {
                icon: FileType,
                title: 'Policies & Guidelines',
                desc: 'Return policies, terms of service, employee handbooks',
                examples: 'refund-policy.pdf, employee-handbook.pdf',
              },
              {
                icon: FileText,
                title: 'FAQs & Support Docs',
                desc: 'Common questions, troubleshooting guides, how-tos',
                examples: 'product-faq.pdf, troubleshooting-guide.txt',
              },
              {
                icon: File,
                title: 'Product Information',
                desc: 'Catalogs, specifications, pricing sheets',
                examples: 'product-catalog.pdf, pricing-2024.pdf',
              },
              {
                icon: FolderOpen,
                title: 'Training Materials',
                desc: 'Scripts, procedures, escalation workflows',
                examples: 'call-scripts.pdf, escalation-process.txt',
              },
            ].map((item) => {
              const Icon = item.icon
              return (
                <Card key={item.title} className="bg-white border-stone-200">
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <div className="h-10 w-10 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-stone-600" />
                      </div>
                      <div>
                        <p className="font-medium text-stone-900">{item.title}</p>
                        <p className="text-sm text-stone-500 mt-0.5">{item.desc}</p>
                        <p className="text-xs text-stone-400 mt-1 font-mono">{item.examples}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </motion.div>

        {/* KB Stats */}
        {!isLoading && kbs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h2 className="text-lg font-semibold text-stone-900 mb-4">Indexed Content</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {kbs.map((kb) => (
                <Card key={kb.id} className="bg-white border-stone-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-stone-500">{kb.name}</p>
                        <p className="text-2xl font-bold text-stone-900">
                          {kb._count?.chunks ?? 0}
                        </p>
                        <p className="text-xs text-stone-500">sections</p>
                      </div>
                      <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center">
                        <FileText className="h-6 w-6 text-amber-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
        )}

        {/* Empty State */}
        {!isLoading && totalChunks === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center py-12"
          >
            <div className="h-16 w-16 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto mb-4">
              <FolderOpen className="h-8 w-8 text-stone-400" />
            </div>
            <h3 className="text-lg font-medium text-stone-900 mb-2">No documents yet</h3>
            <p className="text-sm text-stone-500 max-w-md mx-auto">
              Upload your first document above. Your agents will use this information
              to provide accurate, helpful responses.
            </p>
          </motion.div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-stone-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading…
          </div>
        )}
      </div>
    </div>
  )
}
