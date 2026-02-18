# Velox AI — 6-Day MVP Completion Plan

## Context

The audit identified that Velox AI is ~18% complete. The core voice loop (STT → LLM → TTS) runs in a demo sense, but the system has critical production blockers: zero auth on any route, Stripe webhooks never fire (credits never credited), Twilio signature not applied (open to spoofing), barge-in fires on every word (AI can never finish a sentence), and two incompatible RAG tables mean the knowledge base has zero effect on calls. This plan executes all 15 areas in dependency order across 6 focused days.

---

## Day 1 — Security, Auth & P0 Blockers
**Goal: Make the system safe to run. Fix every door that is currently wide open.**

### 1.1 Rotate Leaked Credentials (30 min)
- Rotate `DEEPGRAM_API_KEY` and `GEMINI_API_KEY` in respective dashboards
- Update `velox-api/.env` with new values (still gitignored, but rotate regardless)
- Add `STRIPE_ENTERPRISE_PRICE_ID` env var (currently maps to wrong `STRIPE_PRO_PRICE_ID` in `stripe.ts` line 31)

### 1.2 Fix Prisma Schema — Add Missing Critical Fields
**File: `velox-api/prisma/schema.prisma`**

Changes:
```prisma
// Organization — add these fields
version       Int       @default(0)          // optimistic locking
reserved_balance Int    @default(0)          // billing pre-auth
deletedAt     DateTime?                      // soft delete

// User — add soft delete
deletedAt     DateTime?

// Agent — add soft delete
deletedAt     DateTime?

// Conversation — fix type + add missing
status        ConversationStatus @default(ACTIVE)  // already exists
cost_accrued  Decimal   @default(0)          // change from Float → Decimal
deletedAt     DateTime?

// Add ABANDONED to ConversationStatus enum
enum ConversationStatus {
  ACTIVE
  COMPLETED
  FAILED
  ABANDONED          // NEW
}

// New model: CallReservation
model CallReservation {
  id               String   @id @default(uuid())
  call_sid         String   @unique
  org_id           String
  org              Organization @relation(fields:[org_id], references:[id])
  reserved_minutes Int
  created_at       DateTime @default(now())
  @@map("call_reservations")
}

// New model: ToolPermission
model ToolPermission {
  id                String  @id @default(uuid())
  org_id            String
  org               Organization @relation(fields:[org_id], references:[id])
  tool_name         String
  enabled           Boolean @default(true)
  rate_limit_per_min Int    @default(10)
  @@unique([org_id, tool_name])
  @@map("tool_permissions")
}

// New model: AuditLog
model AuditLog {
  id             String   @id @default(uuid())
  org_id         String
  user_id        String?
  action         String
  entity         String
  previous_value Json?
  new_value      Json?
  created_at     DateTime @default(now())
  @@index([org_id, created_at])
  @@map("audit_logs")
}

// Conversation — add compound index
@@index([agent_id])
@@index([start_time])
// ADD:
@@index([agent_id, start_time])   // compound index for dashboard queries

// Transaction type — change from String to enum
enum TransactionType {
  CREDIT
  DEBIT
}
// Update Transaction.type to TransactionType
```

Run: `npx prisma migrate dev --name add_missing_schema_fields`

### 1.3 Fix CORS, RequestID Race, and Add Global Error Handler
**File: `velox-api/src/app.ts`**

```typescript
// Replace:  app.use(cors())
// With:
app.use(cors({
  origin: process.env.DASHBOARD_URL || 'http://localhost:5173',
  credentials: true,
}));

// Replace async uuid import with sync import at top of file:
import { v4 as uuidv4 } from 'uuid';
// Remove the async import("uuid") block entirely

// Add after all routes:
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err, reqId: req.id }, 'Unhandled error');
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
    reqId: req.id,
  });
});

// Fix health check to include uptime:
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), version: process.env.npm_package_version });
});
```

### 1.4 Apply Twilio Signature Validation
**File: `velox-api/src/server.ts`**

```typescript
import { validateTwilioWebhook } from './middleware/twilioAuth';
// Replace:  app.use("/voice", voiceRoutes);
// With:
app.use("/voice", validateTwilioWebhook, voiceRoutes);
```

### 1.5 Fix Phone Number Lookup (Complete Production Blocker)
**File: `velox-api/src/routes/voice.ts` line 19**

```typescript
// Uncomment the where clause:
const agent = await prisma.agent.findFirst({
  where: { phone_number: To },  // THIS LINE WAS COMMENTED OUT
  include: { org: true },
});
```

### 1.6 Create JWT Auth Middleware (Clerk)
**New file: `velox-api/src/middleware/auth.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';
import { createClerkClient } from '@clerk/backend';
import { logger } from '../utils/logger';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = await clerk.verifyToken(token);
    req.auth = { userId: payload.sub, orgId: payload.org_id as string };
    next();
  } catch (err) {
    logger.warn({ err }, 'JWT verification failed');
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

Apply to all API routes in `app.ts`:
```typescript
app.use('/api/billing', requireAuth, billingRoutes);
app.use('/api/playground', requireAuth, playgroundRoutes);
app.use('/api/documents', requireAuth, documentRoutes);
```

Install: `npm install @clerk/backend`

---

## Day 2 — Billing Pipeline Completion
**Goal: Money flows correctly. Users pay, credits appear. Calls deduct in real time.**

### 2.1 Create Stripe Webhook Handler (Highest Priority)
**New file: `velox-api/src/routes/webhooks.ts`**

```typescript
import express, { Router } from 'express';
import Stripe from 'stripe';
import { stripe } from '../config/stripe';
import { billingService } from '../services/billingService';
import { logger } from '../utils/logger';

const router = Router();

// CRITICAL: Must use raw body parser BEFORE express.json() for webhook signature
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    logger.error({ err }, 'Stripe webhook signature invalid');
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await billingService.handleSubscriptionSuccess(
        session.metadata!.org_id,
        session.customer as string,
        session.subscription as string,
        session.metadata!.plan_type
      );
      break;
    }
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      // Handle renewal — re-credit minutes
      const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
      const orgId = sub.metadata.org_id;
      const planType = sub.metadata.plan_type;
      if (orgId && planType) {
        await billingService.handleSubscriptionSuccess(orgId, invoice.customer as string, sub.id, planType);
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await billingService.cancelSubscription(sub.metadata.org_id);
      break;
    }
  }

  res.json({ received: true });
});

export default router;
```

Register in `app.ts` BEFORE `express.json()` middleware:
```typescript
import webhookRoutes from './routes/webhooks';
// MUST come before app.use(express.json()):
app.use('/stripe/webhook', webhookRoutes);
app.use(express.json()); // existing line
```

### 2.2 Add Optimistic Locking to Billing Deduction
**File: `velox-api/src/services/billingService.ts`**

```typescript
async deductMinutes(orgId: string, minutes: number, conversationId: string): Promise<boolean> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { credit_balance: true, version: true },
    });
    if (!org || org.credit_balance < minutes) return false;

    const affected = await prisma.$executeRaw`
      UPDATE organizations
      SET credit_balance = credit_balance - ${minutes},
          version = version + 1
      WHERE id = ${orgId}
        AND version = ${org.version}
        AND credit_balance >= ${minutes}
    `;
    if (affected > 0) {
      // Record transaction...
      return true;
    }
    // Conflict: another process updated — retry
  }
  return false;
}
```

### 2.3 Add Real-Time 30-Second Billing Ticker
**File: `velox-api/src/websocket/streamHandler.ts`**

```typescript
// After orchestrator is initialized in 'start' event:
const billingInterval = setInterval(async () => {
  if (!conversationId || !orgId) return;
  const hasBalance = await billingService.hasMinutes(orgId, 1);
  if (!hasBalance) {
    logger.warn(`Org ${orgId} ran out of balance — terminating call ${callSid}`);
    ws.close(1008, 'Insufficient balance');
  } else {
    await billingService.deductMinutes(orgId, 0.5, conversationId); // 30s = 0.5 min
  }
}, 30_000);

// Clear in handleCallEnd:
clearInterval(billingInterval);
```

### 2.4 Add CallReservation Pre-Auth
**File: `velox-api/src/routes/voice.ts`**

```typescript
// After billing check, before creating conversation:
await prisma.callReservation.create({
  data: { call_sid: CallSid, org_id: agent.org_id, reserved_minutes: 5 }
});

// In handleCallEnd (streamHandler.ts), after final deduction:
await prisma.callReservation.deleteMany({ where: { call_sid: callSid } });
```

### 2.5 Fix STRIPE_ENTERPRISE_PRICE_ID Bug
**File: `velox-api/src/config/stripe.ts` line 31**
```typescript
// Change:
priceId: process.env.STRIPE_PRO_PRICE_ID || '',
// To:
priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || '',
```

### 2.6 Fix Stripe Redirect in Frontend
**File: `velox-web/src/pages/Billing.tsx` line ~110**
```typescript
// Replace:
window.location.href = `${import.meta.env.VITE_STRIPE_CHECKOUT_URL}?session_id=${response.data.sessionId}`
// With:
window.location.href = response.data.url  // backend already returns the full Stripe URL
```

---

## Day 3 — Fix the Voice Pipeline (Barge-in, TTS, Audio Buffer)
**Goal: Calls actually work. AI can finish sentences. Barge-in is precise.**

### 3.1 Fix Barge-in Trigger (Critical Bug)
**File: `velox-api/src/services/transcriptionService.ts`**

```typescript
// REMOVE onInterrupt() from the Transcript handler entirely
// ADD a dedicated SpeechStarted listener:
this.deepgramLive.on(LiveTranscriptionEvents.SpeechStarted, () => {
  logger.info('SpeechStarted — triggering barge-in');
  this.onInterrupt();
});

// The Transcript handler becomes:
this.deepgramLive.on(LiveTranscriptionEvents.Transcript, (data) => {
  const transcript = data.channel.alternatives[0].transcript;
  if (transcript && data.is_final) {
    logger.info(`USER (Final): ${transcript}`);
    this.onTranscript(transcript);
  }
  // NO onInterrupt() call here
});
```

### 3.2 Add Deepgram Auto-Reconnect (3 retries)
**File: `velox-api/src/services/transcriptionService.ts`**

```typescript
private reconnectAttempts = 0;
private readonly MAX_RECONNECT = 3;

private handleDisconnect() {
  if (this.reconnectAttempts >= this.MAX_RECONNECT) {
    logger.error('Deepgram: max reconnect attempts reached');
    this.onFallback?.(); // new optional callback
    return;
  }
  this.reconnectAttempts++;
  logger.warn(`Deepgram reconnecting (attempt ${this.reconnectAttempts})`);
  setTimeout(() => this.initDeepgram(), 1000 * this.reconnectAttempts);
}

// In setupEventListeners, add:
this.deepgramLive.on(LiveTranscriptionEvents.Close, () => this.handleDisconnect());
```

### 3.3 Add Redis Stage Tracking to TTS Pipeline
**File: `velox-api/src/services/orchestrator.ts`**

```typescript
// Before calling ttsService.generateAudio():
await SessionService.setStage(this.callSid, CallStage.SPEAKING);

// After all audio is sent for a turn:
await SessionService.setStage(this.callSid, CallStage.LISTENING);

// In handleInterruption():
await SessionService.setStage(this.callSid, CallStage.LISTENING);
await redis.hincrby(`call:${this.callSid}`, 'interrupt_count', 1);
```

### 3.4 Add TTS AbortController (Cancel In-Flight TTS on Barge-in)
**File: `velox-api/src/services/ttsService.ts`**

```typescript
export class TtsService {
  private abortController: AbortController | null = null;

  abort() {
    this.abortController?.abort();
    this.abortController = null;
  }

  async generateAudio(text: string): Promise<Buffer | null> {
    this.abortController = new AbortController();
    try {
      const response = await this.deepgram.speak.request(
        { text },
        { model: 'aura-asteria-en', encoding: 'mulaw', sample_rate: 8000, container: 'none' },
        { signal: this.abortController.signal }  // pass abort signal
      );
      // ... rest of implementation
    } catch (err: any) {
      if (err.name === 'AbortError') return null; // Normal barge-in cancellation
      throw err;
    }
  }
}
```

**File: `velox-api/src/services/orchestrator.ts`** — call `ttsService.abort()` in `handleInterruption()`.

### 3.5 Add Ghost Call Protection (10s Timeout)
**File: `velox-api/src/websocket/streamHandler.ts`**

```typescript
// After 'start' event handling:
let lastAudioTs = Date.now();
const ghostCallTimer = setInterval(() => {
  if (Date.now() - lastAudioTs > 10_000) {
    logger.warn(`Ghost call detected — closing ${callSid}`);
    ws.close(1008, 'Ghost call timeout');
  }
}, 5_000);

// In 'media' case:
lastAudioTs = Date.now();

// In handleCallEnd:
clearInterval(ghostCallTimer);
```

### 3.6 Pre-fetch Filler Audio at Startup
**File: `velox-api/src/services/ttsService.ts`**

```typescript
private static fillerAudio: Buffer | null = null;

static async preloadFiller() {
  const instance = new TtsService();
  TtsService.fillerAudio = await instance.generateAudio("One moment, let me check that for you.");
  logger.info('Filler audio pre-loaded');
}

getFillerAudio(): Buffer | null {
  return TtsService.fillerAudio;
}
```

Call `TtsService.preloadFiller()` in `server.ts` on startup.

### 3.7 Add utterance_end_ms to Deepgram Config
**File: `velox-api/src/services/transcriptionService.ts`**
```typescript
// Add to deepgram.listen.live() config:
utterance_end_ms: 1000,
```

### 3.8 Persist Messages to DB During Calls
**File: `velox-api/src/services/orchestrator.ts`**

```typescript
// After user transcript received:
await prisma.message.create({
  data: { conversation_id: this.conversationId, role: 'user', content: userText, tokens: 0, latency_ms: 0 }
});

// After AI response assembled:
await prisma.message.create({
  data: { conversation_id: this.conversationId, role: 'assistant', content: fullResponse, tokens: estimatedTokens, latency_ms: e2eLatency }
});
```

---

## Day 4 — RAG Pipeline Fix & FastMCP Tool Service
**Goal: Knowledge base actually affects call responses. Tools are properly scoped.**

### 4.1 Consolidate to Single RAG Table (Fix Silent Broken Feature)
**Problem:** `documentRoutes.ts` inserts to `document_chunks` (raw pg pool), but `hybridSearchService.ts` queries `knowledge_chunks` (Prisma). Documents uploaded via REST are never found.

**Fix: `velox-api/src/routes/documentRoutes.ts`** — replace raw `pool.query` insert with `ingestionService.ingestDocument()`:
```typescript
import { ingestionService } from '../services/ingestionService';

// Replace the manual chunk loop with:
const kbId = req.body.kb_id; // require this field
if (!kbId) return res.status(400).json({ error: 'kb_id is required' });

const result = await ingestionService.ingestDocument(kbId, fullText, {
  source: req.file.originalname,
  uploaded_by: req.auth?.userId,
});
res.json({ status: 'success', chunks: result.chunksCreated });
```

Remove the raw `document_chunks` table entirely. Add a migration to drop it.

### 4.2 Fix Similarity Threshold to 0.7
**File: `velox-api/src/services/retrievalService.ts`**
```typescript
// Change:  WHERE 1 - (embedding <=> $1) > 0.3
// To:      WHERE 1 - (embedding <=> $1) > 0.7
```

**File: `velox-api/src/services/hybridSearchService.ts`** — add threshold filter to semantic search results:
```typescript
// In semanticSearch(), add WHERE clause:
WHERE kb_id = ${kbId}
  AND 1 - (embedding <=> ${embeddingParam}::vector) > 0.7
```

### 4.3 Fix SQL Injection in hybridSearchService
**File: `velox-api/src/services/hybridSearchService.ts`**

```typescript
import { Prisma } from '@prisma/client';

// Replace string interpolation:
const embeddingStr = `[${embedding.join(",")}]`;
// With Prisma.sql helper:
const results = await prisma.$queryRaw<any[]>(Prisma.sql`
  SELECT id, content, metadata,
    1 - (embedding <=> ${embeddingStr}::vector) as similarity
  FROM "knowledge_chunks"
  WHERE kb_id = ${kbId}
    AND 1 - (embedding <=> ${embeddingStr}::vector) > 0.7
  ORDER BY embedding <=> ${embeddingStr}::vector
  LIMIT ${limit}
`);
```

Apply the same fix to `ingestionService.ts`.

### 4.4 Add HNSW Index on Embedding Column
**New migration file:**
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS knowledge_chunks_embedding_hnsw_idx
ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

Add to `setup_document_chunks.sql` and as a new Prisma migration.

### 4.5 Add Chunk Deduplication
**File: `velox-api/src/services/ingestionService.ts`**

```typescript
import { createHash } from 'crypto';

// Before insert:
const contentHash = createHash('sha256').update(chunks[i]).digest('hex');
const existing = await prisma.$queryRaw`
  SELECT id FROM knowledge_chunks WHERE kb_id = ${kbId} AND content_hash = ${contentHash}
`;
if ((existing as any[]).length > 0) {
  logger.info(`Skipping duplicate chunk (hash: ${contentHash})`);
  continue;
}
// Add content_hash String? to KnowledgeChunk model in schema.prisma
```

### 4.6 Add org_id Scoping to Document Upload
**File: `velox-api/src/routes/documentRoutes.ts`**

```typescript
// After auth middleware runs (req.auth is available):
const orgId = req.auth?.orgId;
// Verify KB belongs to this org before insert:
const kb = await prisma.knowledgeBase.findFirst({
  where: { id: kbId, org_id: orgId }
});
if (!kb) return res.status(403).json({ error: 'Forbidden' });
```

### 4.7 Complete FastMCP Tool Definitions
**File: `velox-api/src/tools/registry.ts`** — add missing tools (still Node.js, not Python, as per pragmatic 6-day scope):

```typescript
book_appointment: async (args: { date: string; time: string; customer_name: string; org_id: string }) => {
  // TODO: integrate real calendar API
  return { success: true, confirmation_id: `APT-${Date.now()}`, message: `Appointment booked for ${args.customer_name} on ${args.date} at ${args.time}` };
},
search_faq: async (args: { query: string; agent_id: string; org_id: string }) => {
  // Uses RAG internally
  const context = await ragService.retrieveContext(args.query, args.agent_id, 3);
  return { answer: context || 'No FAQ found for that query' };
},
get_customer_profile: async (args: { customer_id: string; org_id: string }) => {
  return { customer_id: args.customer_id, name: 'Mock Customer', status: 'active' };
},
trigger_human_handoff: async (args: { call_sid: string; reason: string; org_id: string }) => {
  logger.info(`Human handoff triggered for call ${args.call_sid}: ${args.reason}`);
  return { success: true, message: 'Transferring to human agent', filler_phrase: 'Let me transfer you to a human agent right away.' };
},
```

**File: `velox-api/src/tools/definitions.ts`** — add org_id param to all tools and add the 3 missing tool definitions.

---

## Day 5 — Observability + React Frontend Pages
**Goal: You can see what's happening. The dashboard is usable.**

### 5.1 LangFuse Integration
**New file: `velox-api/src/services/langfuse.ts`**

```typescript
import { Langfuse } from 'langfuse';

export const langfuse = new Langfuse({
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  baseUrl: process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com',
});

export function createCallTrace(callSid: string, orgId: string, agentId: string) {
  return langfuse.trace({
    id: callSid,
    name: 'voice-call',
    metadata: { org_id: orgId, agent_id: agentId, call_sid: callSid },
  });
}
```

Install: `npm install langfuse`

**Integrate in `orchestrator.ts`:**
```typescript
const trace = createCallTrace(this.callSid, this.orgId, this.agentId);
const sttSpan = trace.span({ name: 'stt', input: { audio_bytes: payload.length } });
// ... after transcript: sttSpan.end({ output: { transcript, confidence } });
const llmSpan = trace.span({ name: 'llm', input: { userText, context } });
// ... after response: llmSpan.end({ output: { response, tokens } });
const ttsSpan = trace.span({ name: 'tts', input: { text: aiSentence } });
// ... after audio: ttsSpan.end({ output: { audio_bytes: audio?.length } });
// After call ends:
trace.score({ name: 'sentiment_score', value: sentimentScore });
```

### 5.2 Add Missing Backend Routes for Frontend

**New file: `velox-api/src/routes/agents.ts`**
```typescript
router.get('/', requireAuth, async (req, res) => {
  const agents = await prisma.agent.findMany({
    where: { org_id: req.auth!.orgId, deletedAt: null },
  });
  res.json(agents);
});
router.post('/', requireAuth, async (req, res) => { /* create agent */ });
router.get('/:id', requireAuth, async (req, res) => { /* get agent, check org_id */ });
router.put('/:id', requireAuth, async (req, res) => { /* update agent, check org_id */ });
```

**New file: `velox-api/src/routes/conversations.ts`**
```typescript
router.get('/', requireAuth, async (req, res) => {
  const conversations = await prisma.conversation.findMany({
    where: { agent: { org_id: req.auth!.orgId }, deletedAt: null },
    include: { agent: true },
    orderBy: { start_time: 'desc' },
    take: 50,
  });
  res.json(conversations);
});
```

Register both in `app.ts`.

### 5.3 React Frontend — Add Clerk Auth
**File: `velox-web/src/main.tsx`**

```tsx
import { ClerkProvider } from '@clerk/clerk-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ClerkProvider>
  </StrictMode>
);
```

**File: `velox-web/src/App.tsx`** — wrap protected routes with `<SignedIn>` + add login route:
```tsx
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';

// Wrap all routes except '/' with:
<SignedIn><Component /></SignedIn>
<SignedOut><RedirectToSignIn /></SignedOut>
```

Update `velox-web/src/lib/api.ts` to use Clerk token instead of `localStorage.getItem('token')`:
```typescript
import { useAuth } from '@clerk/clerk-react';
// Use clerk's getToken() in the request interceptor
```

### 5.4 Add Missing Frontend Pages

**New: `velox-web/src/pages/Dashboard.tsx`**
- Active calls count (from `/api/conversations?status=ACTIVE`)
- Today's call volume bar chart (recharts)
- Recent conversations table

**New: `velox-web/src/pages/Agents.tsx`**
- Agent list from `/api/agents`
- Create / edit agent drawer with: name, system_prompt, voice_id, phone_number, kb_id

**New: `velox-web/src/pages/Calls.tsx`**
- Table of conversations with columns: start_time, duration, status, cost, agent
- Filter by date range and status

**New: `velox-web/src/pages/Knowledge.tsx`**
- KB list per org
- File upload (PDF/TXT) to POST `/api/documents/upload`
- Chunk count display

**Update `velox-web/src/App.tsx`** — add routes:
```tsx
<Route path="/dashboard" element={<Dashboard />} />
<Route path="/agents" element={<Agents />} />
<Route path="/calls" element={<Calls />} />
<Route path="/knowledge" element={<Knowledge />} />
```

### 5.5 Add Error Boundaries
**New: `velox-web/src/components/ErrorBoundary.tsx`**
```tsx
export class ErrorBoundary extends React.Component<...> {
  componentDidCatch(error, info) { console.error(error, info); }
  render() {
    if (this.state.hasError) return <ErrorPage />;
    return this.props.children;
  }
}
```
Wrap every page-level component in `App.tsx`.

### 5.6 Fix Billing.tsx orgId Hardcode
**File: `velox-web/src/pages/Billing.tsx` line ~80**
```typescript
// Replace:
const orgId = 'test-org-id'
// With:
import { useOrganization } from '@clerk/clerk-react';
const { organization } = useOrganization();
const orgId = organization?.id;
```

---

## Day 6 — Quality Gates, CI/CD Hardening & Final Polish
**Goal: Automated testing guards regressions. Deployment pipeline is production-safe.**

### 6.1 DeepEval Quality Gates
**New directory: `velox-api/tests/llm/`**

**New file: `velox-api/tests/llm/test_quality.py`**
```python
from deepeval import evaluate
from deepeval.metrics import (
    AnswerRelevancyMetric,
    FaithfulnessMetric,
    HallucinationMetric,
    ToxicityMetric,
)
from deepeval.test_case import LLMTestCase
import json

with open('tests/llm/golden_dataset.json') as f:
    golden = json.load(f)

metrics = [
    AnswerRelevancyMetric(threshold=0.85),
    FaithfulnessMetric(threshold=0.90),
    HallucinationMetric(threshold=0.10),
    ToxicityMetric(threshold=0.05),
]

test_cases = [
    LLMTestCase(
        input=item['input'],
        actual_output=item['actual_output'],
        expected_output=item['expected_output'],
        context=item.get('context', []),
    )
    for item in golden
]

evaluate(test_cases, metrics)
```

**New file: `velox-api/tests/llm/golden_dataset.json`** — 20 test cases minimum:
```json
[
  {
    "input": "What are your business hours?",
    "expected_output": "We're open Monday to Friday, 9am to 5pm.",
    "actual_output": "...",
    "context": ["Business hours: Monday-Friday 9am-5pm, closed weekends."]
  },
  // ... 19 more
]
```

**New file: `velox-api/requirements-dev.txt`**
```
deepeval>=0.21.0
pytest>=7.4.0
```

### 6.2 CI/CD Hardening
**File: `cloudbuild.yaml`** — add missing steps:

```yaml
steps:
  # 1. Install
  - name: 'node:20'
    entrypoint: npm
    args: ['ci']
    dir: 'velox-api'

  # 2. Lint
  - name: 'node:20'
    entrypoint: npm
    args: ['run', 'lint']
    dir: 'velox-api'

  # 3. Type check
  - name: 'node:20'
    entrypoint: npx
    args: ['tsc', '--noEmit']
    dir: 'velox-api'

  # 4. Unit tests
  - name: 'node:20'
    entrypoint: npm
    args: ['test']
    dir: 'velox-api'

  # 5. DeepEval LLM quality gate
  - name: 'python:3.11-slim'
    entrypoint: bash
    args: ['-c', 'pip install -r requirements-dev.txt && python -m pytest tests/llm/']
    dir: 'velox-api'

  # 6. Docker build
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'europe-west2-docker.pkg.dev/$PROJECT_ID/velox-repo/velox-api:$COMMIT_SHA', '.']
    dir: 'velox-api'

  # 7. Push
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'europe-west2-docker.pkg.dev/$PROJECT_ID/velox-repo/velox-api:$COMMIT_SHA']

  # 8. Deploy with Secret Manager bindings (NOT --set-env-vars)
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - run
      - deploy
      - velox-api-prod
      - '--image=europe-west2-docker.pkg.dev/$PROJECT_ID/velox-repo/velox-api:$COMMIT_SHA'
      - '--region=europe-west2'
      - '--platform=managed'
      - '--no-allow-unauthenticated'
      - '--set-secrets=DATABASE_URL=velox-db-url:latest,REDIS_HOST=velox-redis-host:latest,DEEPGRAM_API_KEY=velox-deepgram-key:latest,GEMINI_API_KEY=velox-gemini-key:latest,STRIPE_SECRET_KEY=velox-stripe-secret:latest,STRIPE_WEBHOOK_SECRET=velox-stripe-webhook:latest,CLERK_SECRET_KEY=velox-clerk-secret:latest,TWILIO_AUTH_TOKEN=velox-twilio-token:latest'
      - '--set-env-vars=NODE_ENV=production'
```

**Remove `--allow-unauthenticated`** — this is a security flag that was noted as "will lock down later". Lock it down now.

### 6.3 Add detect-secrets Pre-commit Hook
**New file: `.pre-commit-config.yaml`**
```yaml
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: no-commit-to-branch
        args: ['--branch', 'main']
```

Run `detect-secrets scan > .secrets.baseline` to initialize.

### 6.4 Update .gitignore
**File: `.gitignore` (root)**
```
.env
*.pem
*credentials*
secrets/
.secrets.baseline
terraform.tfstate
terraform.tfstate.backup
*.tfvars
```

### 6.5 Add MLflow Experiment Tracking Stub
**New file: `velox-api/src/services/mlflow.ts`**
```typescript
// Lightweight HTTP wrapper around MLflow REST API
// Tracks: LLM model version, RAG config, DeepEval scores
export async function logMLflowRun(params: {
  experimentName: string;
  runName: string;
  metrics: Record<string, number>;
  params: Record<string, string>;
}) {
  if (!process.env.MLFLOW_TRACKING_URI) return;
  // POST to MLflow REST API
}
```

### 6.6 Add Weekly DeepEval Regression Cron
**New file: `velox-api/cron/weekly-eval.yaml`** (Cloud Scheduler):
```yaml
name: velox-weekly-llm-eval
schedule: "0 2 * * 1"  # Every Monday at 2am
timeZone: Europe/London
httpTarget:
  uri: https://velox-api-prod-xxx.run.app/api/admin/run-eval
  httpMethod: POST
  oidcToken:
    serviceAccountEmail: velox-cloud-run@PROJECT_ID.iam.gserviceaccount.com
```

---

## Critical Files Modified Per Day

| Day | Files Created/Modified |
|-----|----------------------|
| 1 | `schema.prisma`, `app.ts`, `server.ts`, `voice.ts`, `middleware/auth.ts` |
| 2 | `routes/webhooks.ts` (new), `billingService.ts`, `streamHandler.ts`, `config/stripe.ts`, `Billing.tsx` |
| 3 | `transcriptionService.ts`, `orchestrator.ts`, `ttsService.ts`, `streamHandler.ts` |
| 4 | `documentRoutes.ts`, `retrievalService.ts`, `hybridSearchService.ts`, `ingestionService.ts`, `tools/registry.ts`, `tools/definitions.ts` |
| 5 | `langfuse.ts` (new), `routes/agents.ts` (new), `routes/conversations.ts` (new), `main.tsx`, `App.tsx`, `pages/Dashboard.tsx` (new), `pages/Agents.tsx` (new), `pages/Calls.tsx` (new), `pages/Knowledge.tsx` (new) |
| 6 | `tests/llm/` (new dir), `cloudbuild.yaml`, `.pre-commit-config.yaml`, `.gitignore`, `mlflow.ts` (new) |

---

## Verification Checklist (End of Each Day)

**Day 1:** `curl -X POST http://localhost:8080/voice/incoming` returns 403 (Twilio sig rejected). `curl http://localhost:8080/api/billing/test-org` returns 401 (auth required). `npx prisma db push` succeeds with all new fields.

**Day 2:** Stripe CLI `stripe listen --forward-to localhost:8080/stripe/webhook` → send test event `checkout.session.completed` → org `credit_balance` increments in DB.

**Day 3:** Run `node simulate-twilio.js` → speak → AI responds fully without interruption. Speak again mid-sentence → AI stops within 300ms. Check Redis: `redis-cli hgetall call:{sid}` shows `stage` toggling between `speaking` and `listening`.

**Day 4:** Upload a PDF via `curl -F "file=@test.pdf" -F "kb_id=xxx" http://localhost:8080/api/documents/upload`. Then make a call and ask a question from the PDF — the AI answer references the document content.

**Day 5:** Open `http://localhost:5173` → redirected to Clerk sign-in → sign in → see dashboard with call chart. LangFuse dashboard shows traces with STT/LLM/TTS spans.

**Day 6:** `git push` triggers Cloud Build — lint, typecheck, and DeepEval all pass. Cloud Run deploys with secrets from Secret Manager (not env vars in build config). `gcloud run services describe velox-api-prod` shows no plain-text secrets in env.

---

---

## Addendum: Extended Scope (Distributed Across Days 3–6)

The following five items are now included. Each maps to an existing day where it fits naturally.

---

### A1 — Google ADK Python Service (fits into Day 3 alongside orchestration fixes)

**Goal:** Replace the monolithic TypeScript `LLMService` with a proper Python FastAPI + Google ADK multi-agent architecture. The Node.js API becomes a thin gateway that calls the ADK service via HTTP.

**New service: `agents/` directory**

**New file: `agents/main.py`**
```python
from fastapi import FastAPI
from agents.pipeline import run_agent_turn

app = FastAPI(title="Velox ADK Service")

@app.post("/agent/turn")
async def agent_turn(body: dict):
    result = await run_agent_turn(
        org_id=body["org_id"],
        call_sid=body["call_sid"],
        transcript=body["transcript"],
        history=body.get("history", []),
    )
    return result
```

**New file: `agents/pipeline.py`**
```python
from google.adk.agents import LlmAgent, SequentialAgent, ParallelAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from langfuse.callback import CallbackHandler

# Sub-agents
conversation_agent = LlmAgent(
    name="ConversationAgent",
    model="gemini-2.5-flash",
    instruction="You handle general dialogue. Use conversation history from session state.",
)

rag_agent = LlmAgent(
    name="RAGAgent",
    model="gemini-2.5-flash",
    instruction="Retrieve relevant context for the query using the search_knowledge_base tool.",
    tools=[search_knowledge_base_tool],
    output_key="rag_context",
)

sentiment_agent = LlmAgent(
    name="SentimentAgent",
    model="gemini-2.5-flash",
    instruction="Score the user's sentiment from -1.0 (very negative) to 1.0 (very positive). Output only a float.",
    output_key="sentiment_score",
)

tool_agent = LlmAgent(
    name="ToolAgent",
    model="gemini-2.5-flash",
    instruction="Execute business tools (CRM, orders, calendar) when needed.",
    tools=[check_order_status, book_appointment, search_faq, get_customer_profile, trigger_human_handoff],
)

summarizer_agent = LlmAgent(
    name="SummarizerAgent",
    model="gemini-2.5-flash",
    instruction="After the call ends, summarize the conversation into 2–3 sentences.",
    output_key="call_summary",
)

# Parallel: RAG + Sentiment run concurrently (never block the critical path)
parallel_context = ParallelAgent(
    name="ParallelContextGathering",
    sub_agents=[rag_agent, sentiment_agent],
)

# Full pipeline
supervisor = SequentialAgent(
    name="VeloxSupervisor",
    sub_agents=[parallel_context, tool_agent, conversation_agent],
)

session_service = InMemorySessionService()
runner = Runner(agent=supervisor, session_service=session_service, app_name="velox")

async def run_agent_turn(org_id, call_sid, transcript, history):
    langfuse_handler = CallbackHandler(trace_id=call_sid, metadata={"org_id": org_id})
    session = session_service.get_or_create(call_sid)
    session.state["history"] = history

    response_text = ""
    async for event in runner.run_async(
        user_id=org_id, session_id=call_sid,
        new_message=transcript,
        callbacks=[langfuse_handler],
    ):
        if event.is_final_response():
            response_text = event.content.parts[0].text

    return {
        "response_text": response_text,
        "sentiment_score": session.state.get("sentiment_score"),
        "rag_context": session.state.get("rag_context"),
        "call_summary": session.state.get("call_summary"),
    }
```

**New file: `agents/requirements.txt`**
```
google-adk>=0.6.0
fastapi>=0.115.0
uvicorn>=0.34.0
langfuse>=2.0.0
google-cloud-aiplatform>=1.70.0
```

**New file: `agents/Dockerfile`**
```dockerfile
FROM python:3.11-slim AS base
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8090
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8090"]
```

**Update Node.js orchestrator** — replace direct `LLMService.generateResponse()` call with HTTP POST to ADK service:

**File: `velox-api/src/services/orchestrator.ts`**
```typescript
const adkResponse = await fetch(`${process.env.ADK_SERVICE_URL}/agent/turn`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ org_id: this.orgId, call_sid: this.callSid, transcript: userText, history }),
});
const { response_text, sentiment_score } = await adkResponse.json();
```

**Update `cloudbuild.yaml`** — add second Docker build + Cloud Run deploy step for the ADK Python service.

**Query complexity routing (70% / 25% / 5%):**
In `agents/pipeline.py`, add a router before the supervisor:
```python
def route_model(transcript: str) -> str:
    """Simple heuristic: short/simple → Phi-3, medium → Flash, complex → Pro."""
    word_count = len(transcript.split())
    if word_count < 15:
        return "phi-3-mini"        # 70% of calls
    elif word_count < 50:
        return "gemini-2.5-flash"  # 25% of calls
    else:
        return "gemini-2.5-pro"    # 5% of calls
```
Note: Phi-3-mini offline requires Ollama or Vertex AI Model Garden endpoint — stub the integration, pass the model name through to Gemini Flash as fallback until the Phi-3 endpoint is provisioned.

---

### A2 — LoRA/PEFT Fine-Tuning Pipeline (fits into Day 6 alongside CI/CD)

**Goal:** Set up the infrastructure to fine-tune Phi-3-mini and Mistral-7B on call transcript data collected from production. This is a pipeline definition, not a training run (training takes GPU hours that happen asynchronously).

**New directory: `fine-tuning/`**

**New file: `fine-tuning/train.py`**
```python
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments
from peft import LoraConfig, get_peft_model, TaskType
from trl import SFTTrainer
import datasets

def train(model_name: str, dataset_path: str, output_dir: str):
    model = AutoModelForCausalLM.from_pretrained(model_name, load_in_8bit=True, device_map="auto")
    tokenizer = AutoTokenizer.from_pretrained(model_name)

    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        target_modules=["q_proj", "v_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type=TaskType.CAUSAL_LM,
    )
    model = get_peft_model(model, lora_config)

    dataset = datasets.load_dataset("json", data_files=dataset_path)["train"]

    trainer = SFTTrainer(
        model=model,
        train_dataset=dataset,
        args=TrainingArguments(
            output_dir=output_dir,
            num_train_epochs=3,
            per_device_train_batch_size=4,
            gradient_accumulation_steps=4,
            learning_rate=2e-4,
            fp16=True,
            logging_steps=10,
            save_strategy="epoch",
        ),
        dataset_text_field="text",
    )
    trainer.train()
    model.save_pretrained(output_dir)

if __name__ == "__main__":
    train("microsoft/Phi-3-mini-4k-instruct", "data/calls.jsonl", "output/phi3-velox-v1")
```

**New file: `fine-tuning/export_training_data.py`**
```python
# Exports completed call conversations from Postgres to JSONL format for fine-tuning
import psycopg2, json, os

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cursor = conn.cursor()
cursor.execute("""
    SELECT m.role, m.content
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.status = 'COMPLETED'
    ORDER BY c.id, m.created_at
""")
rows = cursor.fetchall()
# Group by conversation and write as instruction-following JSONL
```

**New file: `fine-tuning/requirements.txt`**
```
transformers>=4.44.0
peft>=0.12.0
trl>=0.10.0
bitsandbytes>=0.43.0
datasets>=2.21.0
accelerate>=0.33.0
```

**MLflow integration** — update `velox-api/src/services/mlflow.ts` to log fine-tuning run metrics (loss, eval perplexity) when training completes. Fine-tuning jobs log to the same MLflow server used for production inference tracking.

**New file: `fine-tuning/Dockerfile`** (GPU-capable, runs on Cloud Run GPU or Vertex AI Custom Job):
```dockerfile
FROM nvidia/cuda:12.1-runtime-ubuntu22.04
RUN apt-get update && apt-get install -y python3-pip
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["python3", "train.py"]
```

---

### A3 — LangSmith Prompt Versioning (fits into Day 5 alongside observability)

**Goal:** Move all hardcoded system prompts out of source code and into LangSmith Hub so prompts are versioned, auditable, and changeable without a code deploy.

**Install:** `npm install langsmith` in `velox-api/`

**New file: `velox-api/src/services/promptService.ts`**
```typescript
import { Client } from 'langsmith';

const langsmith = new Client({
  apiUrl: process.env.LANGCHAIN_ENDPOINT || 'https://api.smith.langchain.com',
  apiKey: process.env.LANGCHAIN_API_KEY,
});

const promptCache = new Map<string, { template: string; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

export async function getPrompt(promptName: string, version?: string): Promise<string> {
  const cacheKey = `${promptName}:${version || 'latest'}`;
  const cached = promptCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.template;
  }

  const prompt = await langsmith.pullPrompt(promptName, { includeModel: false });
  const template = (prompt as any).messages[0].prompt.template as string;
  promptCache.set(cacheKey, { template, fetchedAt: Date.now() });
  return template;
}
```

**Update `velox-api/src/services/llmService.ts`** — replace hardcoded `this.systemPrompt` string:
```typescript
// Replace:
this.systemPrompt = `You are a helpful assistant named Velox...`
// With:
this.systemPrompt = await getPrompt('velox/system-prompt');
```

**Update `agents/pipeline.py`** — load instructions from LangSmith for each agent:
```python
from langsmith import Client
ls_client = Client()

def get_prompt(name: str) -> str:
    prompt = ls_client.pull_prompt(name)
    return prompt.messages[0].prompt.template

conversation_agent = LlmAgent(
    instruction=get_prompt("velox/conversation-agent"),
    ...
)
```

**Push initial prompts to LangSmith Hub** as part of Day 5 setup:
```bash
# In a one-time setup script: fine-tuning/push_prompts.py
from langsmith import Client
client = Client()
client.push_prompt("velox/system-prompt", object=ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant named Velox. Tone: Professional but friendly. Keep answers under 2 sentences.")
]))
```

Add env vars: `LANGCHAIN_API_KEY`, `LANGCHAIN_PROJECT=velox-production`, `LANGCHAIN_ENDPOINT`.

---

### A4 — Phi-3-mini Offline Routing (fits into Day 3 inside ADK pipeline, extended)

**Goal:** Route 70% of simple/short queries to a locally-hosted Phi-3-mini SLM to reduce cost and latency. The routing decision happens in the ADK service before any LLM call.

**Deployment approach:** Phi-3-mini runs as a separate Cloud Run service using Ollama as the runtime. The ADK service calls it via OpenAI-compatible API.

**New file: `agents/slm/Dockerfile`** (Ollama-based Phi-3 server):
```dockerfile
FROM ollama/ollama:latest
RUN ollama pull phi3:mini
EXPOSE 11434
CMD ["ollama", "serve"]
```

**Update `agents/pipeline.py`** — wire the router to actual models:
```python
import httpx

async def call_phi3(prompt: str) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{os.environ['PHI3_SERVICE_URL']}/api/generate",
            json={"model": "phi3:mini", "prompt": prompt, "stream": False},
            timeout=10.0,
        )
    return resp.json()["response"]

async def run_agent_turn(org_id, call_sid, transcript, history):
    model = route_model(transcript)

    if model == "phi-3-mini":
        # Fast path — skip full ADK pipeline for simple queries
        response_text = await call_phi3(build_simple_prompt(transcript, history))
        return {"response_text": response_text, "sentiment_score": None, "model_used": "phi-3-mini"}

    # Route to Gemini Flash or Pro via ADK pipeline
    ...
```

**Update `cloudbuild.yaml`** — add third Docker build + Cloud Run deploy step for the Phi-3 Ollama service.

**Add env var:** `PHI3_SERVICE_URL=https://velox-phi3-xxx.run.app`

---

### A5 — ElevenLabs TTS (fits into Day 3 alongside TTS fixes)

**Goal:** Add ElevenLabs as a higher-quality TTS option alongside Deepgram Aura. The agent's `voice_id` field determines which provider is used — ElevenLabs voice IDs start with a known prefix.

**Install:** `npm install elevenlabs` in `velox-api/`

**Update `velox-api/src/services/ttsService.ts`** — add provider routing:
```typescript
import { ElevenLabsClient } from 'elevenlabs';

export class TtsService {
  private deepgram = createClient(process.env.DEEPGRAM_API_KEY!);
  private elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

  async generateAudio(text: string, voiceId?: string): Promise<Buffer | null> {
    this.abortController = new AbortController();

    // Route by voice_id prefix
    if (voiceId?.startsWith('el_')) {
      return this.generateElevenLabs(text, voiceId.replace('el_', ''));
    }
    return this.generateDeepgramAura(text);
  }

  private async generateElevenLabs(text: string, voiceId: string): Promise<Buffer | null> {
    try {
      const stream = await this.elevenlabs.textToSpeech.convertAsStream(voiceId, {
        text,
        model_id: 'eleven_turbo_v2_5',
        output_format: 'ulaw_8000',  // Direct mulaw for Twilio
      });
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        if (this.abortController?.signal.aborted) return null;
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (err: any) {
      if (err.name === 'AbortError') return null;
      logger.error({ err }, 'ElevenLabs TTS error');
      return null;
    }
  }

  private async generateDeepgramAura(text: string): Promise<Buffer | null> {
    // ... existing Deepgram implementation
  }
}
```

Pass `voiceId` from the `Agent` record through `CallOrchestrator` → `handleUserMessage` → `ttsService.generateAudio(sentence, this.agentVoiceId)`.

Add `ELEVENLABS_API_KEY` to all env and Secret Manager configs.

---

## Updated File Table (All Days Including Addendum)

| Day | Files Created/Modified |
|-----|----------------------|
| 1 | `schema.prisma`, `app.ts`, `server.ts`, `voice.ts`, `middleware/auth.ts` |
| 2 | `routes/webhooks.ts` (new), `billingService.ts`, `streamHandler.ts`, `config/stripe.ts`, `Billing.tsx` |
| 3 | `transcriptionService.ts`, `orchestrator.ts`, `ttsService.ts` (+ ElevenLabs), `streamHandler.ts`, `agents/main.py` (new), `agents/pipeline.py` (new), `agents/slm/Dockerfile` (new), `agents/requirements.txt` (new), `agents/Dockerfile` (new) |
| 4 | `documentRoutes.ts`, `retrievalService.ts`, `hybridSearchService.ts`, `ingestionService.ts`, `tools/registry.ts`, `tools/definitions.ts` |
| 5 | `langfuse.ts` (new), `promptService.ts` (new), `llmService.ts`, `routes/agents.ts` (new), `routes/conversations.ts` (new), `main.tsx`, `App.tsx`, `pages/Dashboard.tsx` (new), `pages/Agents.tsx` (new), `pages/Calls.tsx` (new), `pages/Knowledge.tsx` (new) |
| 6 | `tests/llm/` (new dir), `fine-tuning/` (new dir), `cloudbuild.yaml`, `.pre-commit-config.yaml`, `.gitignore`, `mlflow.ts`, `cron/weekly-eval.yaml` (new) |
