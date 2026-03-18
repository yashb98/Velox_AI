# L6: Application Layer

> Reference layer for API design, orchestration, guardrails, and caching.

---

## 6.1 API Architecture

- **AI Gateway**: Unified entry for auth, rate limiting, routing, caching, metering (Kong / custom FastAPI / Portkey)
- **Orchestration Service**: Multi-step workflows, retry, fallback (LangGraph / Temporal)
- **Guardrails Layer**: Input + output validation (Guardrails AI / Lakera / NeMo)
- **Response Cache**: Semantic caching to reduce LLM costs 20-40% (GPTCache / Redis)

### FastAPI Pattern

```python
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
import structlog

logger = structlog.get_logger()
app = FastAPI(title="AI Service", version="1.0.0")

class PredictRequest(BaseModel):
    query: str
    context: list[str] | None = None
    max_tokens: int = 512

class PredictResponse(BaseModel):
    answer: str
    sources: list[str]
    confidence: float
    latency_ms: float

@app.post("/predict", response_model=PredictResponse)
async def predict(request: PredictRequest, settings=Depends(get_settings)):
    # 1. Input validation (guardrails)
    validated = await validate_input(request)
    # 2. Feature retrieval
    features = await feature_store.get_features(validated)
    # 3. Model inference
    result = await model_service.predict(validated, features)
    # 4. Output validation (guardrails)
    safe_result = await validate_output(result)
    return safe_result

@app.get("/health")
async def health():
    return {"status": "healthy", "model_loaded": True}
```

---

## 6.2 Orchestration Patterns

| Pattern | Architecture | Use Case | Complexity |
|---------|-------------|----------|-----------|
| Simple Chain | Prompt → LLM → Parse | Q&A, classification | Low |
| RAG Pipeline | Query → Embed → Retrieve → Rerank → LLM | Knowledge Q&A | Medium |
| Agent Loop | Plan → Tool → Observe → Decide (loop) | Research, analysis | High |
| Multi-Agent | Supervisor routes to specialists | Workflows, review | Very High |
| Router | Classifier → specialised model | Cost optimisation | Medium |

---

## 6.3 Guardrails Architecture

| Type | Catches | Implementation | Budget |
|------|---------|---------------|--------|
| Prompt Injection | Override attempts | Classifier + heuristics | <50ms |
| PII Detection | Names, SSN, cards | Presidio + NER | <30ms |
| Toxicity Filter | Harmful content | Perspective API / classifier | <100ms |
| Hallucination Check | Ungrounded claims | NLI cross-encoder | <200ms |
| Topic Guard | Off-domain queries | Intent classifier | <50ms |
| Format Validation | Schema compliance | Pydantic / JSON Schema | <5ms |
| Cost Guard | Runaway tokens | Budget per request | <1ms |

### Implementation

```python
# guardrails/pipeline.py
from typing import NamedTuple

class GuardrailResult(NamedTuple):
    passed: bool
    blocked_by: str | None = None
    details: dict | None = None

async def run_input_guardrails(text: str) -> GuardrailResult:
    # Run in parallel for speed
    results = await asyncio.gather(
        check_prompt_injection(text),
        check_pii(text),
        check_toxicity(text),
        check_topic_boundary(text),
    )
    for check_name, passed, details in results:
        if not passed:
            return GuardrailResult(False, check_name, details)
    return GuardrailResult(True)
```

---

## 6.4 Error Handling Pattern

```python
# Standard error handling for AI services
from fastapi import HTTPException
from enum import Enum

class AIErrorCode(str, Enum):
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"
    GUARDRAIL_BLOCKED = "GUARDRAIL_BLOCKED"
    RATE_LIMITED = "RATE_LIMITED"
    CONTEXT_TOO_LONG = "CONTEXT_TOO_LONG"
    TIMEOUT = "INFERENCE_TIMEOUT"

class AIServiceError(HTTPException):
    def __init__(self, code: AIErrorCode, detail: str):
        super().__init__(status_code=self._status(code), detail={"code": code, "message": detail})

    @staticmethod
    def _status(code):
        return {
            AIErrorCode.MODEL_UNAVAILABLE: 503,
            AIErrorCode.GUARDRAIL_BLOCKED: 422,
            AIErrorCode.RATE_LIMITED: 429,
            AIErrorCode.CONTEXT_TOO_LONG: 413,
            AIErrorCode.TIMEOUT: 504,
        }.get(code, 500)
```

---

## Audit Checklist

- [ ] API documented with OpenAPI/Swagger
- [ ] Input validation on all endpoints (Pydantic models)
- [ ] Error handling with structured error responses
- [ ] Rate limiting configured
- [ ] Authentication/authorisation on endpoints
- [ ] Guardrails on LLM input and output
- [ ] Response caching strategy
- [ ] Timeout handling with fallback
- [ ] CORS configured appropriately
- [ ] Request/response logging
