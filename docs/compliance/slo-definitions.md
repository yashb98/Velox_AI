# Service Level Objectives (SLOs)

## Overview

This document defines the Service Level Objectives for Velox AI platform services.

**Effective Date:** 2026-03-18
**Review Cycle:** Quarterly
**Owner:** Platform Engineering Team

---

## SLO Definitions

### SLO-1: API Availability

| Field | Value |
|-------|-------|
| **Target** | 99.9% |
| **Measurement Window** | Rolling 30 days |
| **Indicator** | Percentage of successful HTTP responses (2xx, 3xx) |
| **Exclusions** | Scheduled maintenance windows |

**Error Budget:** 43.2 minutes/month

**Measurement:**
```
availability = (total_requests - 5xx_errors) / total_requests
```

---

### SLO-2: Voice Call Success Rate

| Field | Value |
|-------|-------|
| **Target** | 99.5% |
| **Measurement Window** | Rolling 7 days |
| **Indicator** | Percentage of calls that complete without system error |
| **Exclusions** | User-initiated hangups, network issues on user side |

**Error Budget:** 50.4 minutes/week

**Measurement:**
```
success_rate = (completed_calls + user_abandoned) / total_calls
```

---

### SLO-3: End-to-End Latency

| Field | Value |
|-------|-------|
| **Target** | P95 < 2 seconds |
| **Measurement Window** | Rolling 24 hours |
| **Indicator** | Time from user speech end to AI audio playback start |
| **Exclusions** | Network latency outside Velox infrastructure |

**Measurement Points:**
- `stt_end` → `tts_first_byte`

**Histogram Buckets:** 500ms, 1s, 1.5s, 2s, 3s, 5s

---

### SLO-4: LLM Response Quality

| Field | Value |
|-------|-------|
| **Target** | Answer Relevancy ≥ 85% |
| **Measurement Window** | Rolling 7 days |
| **Indicator** | DeepEval AnswerRelevancyMetric score |
| **Exclusions** | Intentionally adversarial inputs |

**Measurement:**
- Weekly automated evaluation against golden dataset
- Score aggregated across all test cases

---

### SLO-5: Data Freshness (RAG)

| Field | Value |
|-------|-------|
| **Target** | 99% of queries use data < 24 hours old |
| **Measurement Window** | Rolling 7 days |
| **Indicator** | Age of most recent document in retrieval results |
| **Exclusions** | Newly created knowledge bases (< 1 hour) |

---

## Error Budget Policy

### Consumption Thresholds

| Budget Consumed | Action |
|-----------------|--------|
| < 50% | Normal operations |
| 50-75% | Increased monitoring, no risky deployments |
| 75-90% | Feature freeze, reliability improvements only |
| > 90% | Incident response, all hands on reliability |

### Error Budget Reset
- Error budgets reset at the start of each measurement window
- Unused budget does not carry over

---

## Alerting Thresholds

### P1 (Critical) - Page immediately
- Availability < 99% for 5 minutes
- Voice call success rate < 95% for 15 minutes
- P99 latency > 10 seconds for 5 minutes

### P2 (High) - Alert Slack, page if no response in 30 min
- Availability < 99.5% for 15 minutes
- Error budget consumed > 50% in first week
- LLM quality score < 80%

### P3 (Medium) - Alert Slack
- Availability < 99.9% for 1 hour
- Latency P95 > 3 seconds for 30 minutes
- Unusual traffic patterns detected

---

## Monitoring Dashboard

### Required Panels
1. Availability (current + 30-day trend)
2. Error budget consumption
3. Latency histogram (P50, P95, P99)
4. Active calls gauge
5. LLM quality trend
6. Cost per call trend

### Dashboard URL
Production: `https://grafana.velox.ai/d/slo-overview`

---

## Review Process

1. **Weekly:** SLO metrics reviewed in engineering standup
2. **Monthly:** Error budget review with leadership
3. **Quarterly:** SLO targets reassessed based on customer feedback

---

## Appendix: Prometheus Queries

### Availability
```promql
sum(rate(http_requests_total{status!~"5.."}[30d])) /
sum(rate(http_requests_total[30d]))
```

### P95 Latency
```promql
histogram_quantile(0.95, sum(rate(velox_e2e_latency_seconds_bucket[24h])) by (le))
```

### Error Budget Remaining
```promql
1 - (1 - (sum(rate(http_requests_total{status!~"5.."}[30d])) / sum(rate(http_requests_total[30d])))) / (1 - 0.999)
```
