# Model Card: Gemini 2.5 Flash / Pro

## Model Details

### Overview
| Field | Value |
|-------|-------|
| **Model Name** | Gemini 2.5 Flash / Gemini 2.5 Pro |
| **Model Provider** | Google DeepMind |
| **Model Version** | gemini-2.5-flash, gemini-2.5-pro |
| **Model Type** | Large Language Model (LLM) |
| **Intended Use** | Voice agent conversations, customer support |
| **Last Updated** | 2026-03-18 |

### Model Description
Velox AI uses Google's Gemini models for generating conversational responses in voice agent interactions. The models are accessed via the Google AI API and are not fine-tuned or modified by Velox.

## Intended Use

### Primary Use Cases
1. **Customer Support** - Answering customer inquiries about business hours, orders, returns
2. **Information Retrieval** - RAG-augmented responses from uploaded knowledge bases
3. **Task Completion** - Booking appointments, checking order status via tool calling
4. **General Conversation** - Handling greetings, clarifications, follow-ups

### Out of Scope Uses
- Medical diagnosis or treatment advice
- Legal advice
- Financial investment advice
- Emergency services
- Content moderation decisions without human review

## Model Routing

### Routing Strategy
Velox implements a multi-model routing strategy to optimize cost and latency:

| Condition | Model Used | Rationale |
|-----------|------------|-----------|
| < 15 words | Phi-3-mini (SLM) | Fast, cost-effective for simple queries |
| 15-50 words | Gemini 2.5 Flash | Balanced speed and capability |
| > 50 words | Gemini 2.5 Pro | Maximum capability for complex queries |

### Fallback Behavior
- If Phi-3 fails → Fallback to Gemini Flash
- If Gemini Flash fails → Retry with exponential backoff
- If all retries fail → Return error message to user

## Performance Metrics

### Latency Targets
| Metric | Target | Actual (P95) |
|--------|--------|--------------|
| Time to First Token | < 500ms | ~400ms |
| End-to-End (speech-to-speech) | < 2s | ~1.8s |

### Quality Metrics (DeepEval)
| Metric | Threshold | Typical Score |
|--------|-----------|---------------|
| Answer Relevancy | ≥ 0.85 | 0.91 |
| Faithfulness | ≥ 0.90 | 0.94 |
| Hallucination | ≤ 0.10 | 0.06 |
| Toxicity | ≤ 0.05 | 0.01 |

## Limitations and Risks

### Known Limitations
1. **Knowledge Cutoff** - Models have training data cutoffs; real-time info requires RAG
2. **Hallucination Risk** - May generate plausible but incorrect information
3. **Context Length** - Limited context window may truncate long conversations
4. **Latency Variability** - API response times vary with load

### Risk Mitigation
| Risk | Mitigation |
|------|------------|
| Hallucination | RAG grounding, faithfulness metrics, output guardrails |
| Harmful Content | Input/output guardrails, toxicity filtering |
| PII Leakage | PII detection and masking |
| Prompt Injection | Input validation, injection pattern detection |
| Cost Overrun | Cost guards, budget limits per organization |

## Ethical Considerations

### Fairness
- Models may exhibit biases present in training data
- Velox does not add demographic-specific prompting
- Regular evaluation against diverse test cases

### Privacy
- User conversations are logged for quality improvement
- PII is detected and masked before storage
- Data retention policy: 90 days default

### Transparency
- Users are informed they are speaking with an AI
- Model used is logged in LangFuse traces
- Confidence scores available via API

## Evaluation

### Evaluation Dataset
- 20 golden test cases covering common business scenarios
- Scenarios: business hours, returns, shipping, payments, tracking, etc.
- Updated quarterly based on real conversation patterns

### Evaluation Process
1. Weekly automated DeepEval runs via Cloud Scheduler
2. Results logged to MLflow for trend analysis
3. Human review of edge cases flagged by low scores
4. Model routing thresholds adjusted based on results

## Updates and Versioning

### Version History
| Date | Change | Impact |
|------|--------|--------|
| 2026-03-18 | Initial model card | - |
| 2026-01-15 | Added Gemini 2.5 models | Improved quality |
| 2025-12-01 | Added Phi-3 SLM routing | 40% cost reduction |

### Update Process
1. New model versions evaluated against golden dataset
2. A/B testing in staging environment
3. Gradual rollout with monitoring
4. Rollback plan if quality metrics degrade

## Contact

**Model Governance Team:** ai-governance@velox.ai
**Last Review Date:** 2026-03-18
**Next Review Date:** 2026-06-18
