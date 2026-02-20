// src/pages/Knowledge.tsx
// 5.5 — Knowledge Base management page.
//        Lists KBs, shows chunk counts, allows PDF/TXT upload via POST /api/documents/upload.

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  BookOpen,
  LayoutDashboard,
  Upload,
  FileText,
  Database,
  Loader2,
  Check,
  Plus,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface KnowledgeBase {
  id: string
  name: string
  description: string | null
  chunk_size: number
  chunk_overlap: number
  _count?: { chunks: number }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Knowledge() {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null)
  const [uploadResult, setUploadResult] = useState<{
    chunks: number
    skipped: number
  } | null>(null)

  // Fetch knowledge bases — uses the agents endpoint to get KB info
  const { data: kbs = [], isLoading } = useQuery<KnowledgeBase[]>({
    queryKey: ['knowledge-bases'],
    queryFn: () =>
      api.get<KnowledgeBase[]>('/api/agents/knowledge-bases').then((r) => r.data).catch(() => []),
  })

  // Upload mutation
  const uploadMut = useMutation({
    mutationFn: async ({ file, kbId }: { file: File; kbId: string }) => {
      const form = new FormData()
      form.append('file', file)
      form.append('kb_id', kbId)
      const res = await api.post<{ status: string; chunks: number; skipped: number }>(
        '/api/documents/upload',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      return res.data
    },
    onSuccess: (data) => {
      setUploadResult({ chunks: data.chunks, skipped: data.skipped ?? 0 })
      qc.invalidateQueries({ queryKey: ['knowledge-bases'] })
      toast.success(`Uploaded: ${data.chunks} chunks added`)
    },
    onError: () => toast.error('Upload failed'),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedKbId) {
      toast.error('Select a knowledge base first')
      return
    }
    setUploadResult(null)
    uploadMut.mutate({ file, kbId: selectedKbId })
    // Reset input so same file can be re-uploaded
    e.target.value = ''
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
            <BookOpen className="h-6 w-6 text-blue-400" />
            <h1 className="text-xl font-semibold text-white">Knowledge Bases</h1>
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

      <div className="container mx-auto px-6 py-8 space-y-8">
        {/* Upload Panel */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-2 border-dashed border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                Upload Document
              </CardTitle>
              <CardDescription>
                Supported formats: PDF, TXT. The document will be chunked and
                embedded into the selected knowledge base.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {kbs.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Target Knowledge Base</Label>
                  <div className="flex flex-wrap gap-2">
                    {kbs.map((kb) => (
                      <button
                        key={kb.id}
                        type="button"
                        onClick={() => setSelectedKbId(kb.id)}
                        className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                          selectedKbId === kb.id
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        {kb.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {kbs.length === 0 && !isLoading && (
                <p className="text-sm text-muted-foreground">
                  No knowledge bases found. Create an agent with a knowledge base first.
                </p>
              )}

              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!selectedKbId || uploadMut.isPending}
                >
                  {uploadMut.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Choose File
                    </>
                  )}
                </Button>

                {uploadResult && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <Check className="h-4 w-4" />
                    <span>
                      {uploadResult.chunks} chunks added
                      {uploadResult.skipped > 0 && `, ${uploadResult.skipped} skipped (duplicates)`}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* KB List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {isLoading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading knowledge bases…
            </div>
          )}

          {!isLoading && kbs.length === 0 && (
            <div className="text-center py-16">
              <Database className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-40" />
              <h2 className="text-xl font-semibold mb-2">No knowledge bases</h2>
              <p className="text-muted-foreground mb-4">
                Create an agent with a knowledge base configured to get started.
              </p>
              <Button asChild>
                <Link to="/agents">
                  <Plus className="h-4 w-4 mr-2" />
                  Create an Agent
                </Link>
              </Button>
            </div>
          )}

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {kbs.map((kb, i) => (
              <motion.div
                key={kb.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedKbId === kb.id ? 'border-2 border-primary' : ''
                  }`}
                  onClick={() => setSelectedKbId(kb.id)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Database className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{kb.name}</CardTitle>
                          {kb.description && (
                            <CardDescription className="text-xs mt-0.5">
                              {kb.description}
                            </CardDescription>
                          )}
                        </div>
                      </div>
                      {selectedKbId === kb.id && (
                        <Badge variant="default">Selected</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Chunk count */}
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">
                        {kb._count?.chunks ?? '—'}
                      </span>
                      <span className="text-muted-foreground">chunks stored</span>
                    </div>

                    {/* Config badges */}
                    <div className="flex gap-2 flex-wrap text-xs text-muted-foreground">
                      <span className="border rounded px-2 py-0.5">
                        chunk: {kb.chunk_size} tokens
                      </span>
                      <span className="border rounded px-2 py-0.5">
                        overlap: {kb.chunk_overlap}
                      </span>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedKbId(kb.id)
                        fileInputRef.current?.click()
                      }}
                      disabled={uploadMut.isPending}
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      Upload to this KB
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
