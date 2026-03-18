<!-- ⚠️ STALE: Rewrite as voice-pipeline doc with Pipecat architecture -->
# L5: Model Serving

> Reference layer for inference infrastructure, optimisation, and deployment strategies.

---

## 5.1 Serving Engines

| Engine | Best For | Key Features | Latency |
|--------|----------|-------------|---------|
| vLLM | LLM at scale | PagedAttention, continuous batching, OpenAI API | 100-500ms TTFT |
| TGI | LLM (HF ecosystem) | Flash Attention, grammar support | Similar to vLLM |
| Triton | Multi-framework | Dynamic batching, ensembles, TensorRT | 5-50ms classical |
| TorchServe | PyTorch simple | Easy packaging, metrics OOTB | 10-100ms |
| BentoML | Multi-model pipes | Composition, adaptive batching | Varies |
| ONNX Runtime | Cross-framework opt | Graph opt, quantisation | 1-20ms optimised |

**Decision**: vLLM for LLM inference (de facto standard 2025-26). Triton for classical ML. BentoML for pipelines.

---

## 5.2 Inference Optimisation

| Technique | Effect | Impact | Trade-off |
|-----------|--------|--------|-----------|
| Quantisation (GPTQ/AWQ) | FP16→INT8/INT4 | 2-4x memory, 1.5-3x throughput | <1% accuracy loss |
| Continuous Batching | Dynamic request batching | 3-10x throughput | Slight P99 increase |
| Speculative Decoding | Small model drafts, large verifies | 2-3x speedup | Requires paired models |
| Flash Attention | Fused attention kernel | 2-4x attention speedup | Ampere+ GPU |
| Prefix Caching | Cache KV for shared prefixes | 50-90% TTFT reduction | Memory overhead |
| Structured Output | Force JSON schema | Eliminates post-proc failures | Slight latency |

---

## 5.3 Deployment Strategies

| Strategy | How | Best For | Rollback |
|----------|-----|----------|----------|
| Blue-Green | Swap traffic atomically | Major versions | Seconds |
| Canary | Route small % → monitor → increase | Incremental updates | Seconds |
| Shadow | Parallel run, compare outputs | High-risk models | N/A |
| A/B Test | Statistical traffic split | Business impact measurement | Seconds |

---

## 5.4 Auto-Scaling Configuration

```yaml
# Kubernetes HPA for model serving
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: model-server-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: model-server
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Pods
    pods:
      metric:
        name: inference_requests_per_second
      target:
        type: AverageValue
        averageValue: "100"
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
```

---

## Audit Checklist

- [ ] Serving infrastructure defined (not raw Flask/FastAPI for inference)
- [ ] Inference optimisation applied (quantisation, batching, caching)
- [ ] Deployment strategy defined (not "push and pray")
- [ ] Auto-scaling configured
- [ ] Health/readiness probes on serving endpoints
- [ ] Load testing performed (know your capacity limits)
- [ ] Fallback model defined (what happens when primary fails?)
