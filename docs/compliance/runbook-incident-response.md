# Incident Response Runbook

## Overview

This runbook provides step-by-step guidance for responding to incidents affecting the Velox AI platform.

**Last Updated:** 2026-03-18
**Owner:** On-Call Engineering Team

---

## Incident Severity Levels

| Severity | Definition | Response Time | Example |
|----------|------------|---------------|---------|
| **SEV1** | Complete service outage | 15 minutes | API returning 5xx for all users |
| **SEV2** | Major feature degraded | 30 minutes | Voice calls failing > 10% |
| **SEV3** | Minor feature degraded | 2 hours | Slow response times |
| **SEV4** | Cosmetic/minor issue | Next business day | Dashboard UI glitch |

---

## Incident Response Process

### 1. Detection
- PagerDuty alert received
- Customer report via support
- Monitoring dashboard anomaly

### 2. Triage (First 5 minutes)
1. Acknowledge the alert in PagerDuty
2. Check the Grafana dashboard: `https://grafana.velox.ai/d/overview`
3. Determine severity level
4. Open incident channel: `/incident new [title]` in Slack

### 3. Investigation
1. Check recent deployments: `git log --oneline -10`
2. Check Cloud Run logs: `gcloud logging read "resource.type=cloud_run_revision"`
3. Check database status: Prisma Studio or Cloud SQL console
4. Check Redis status: `redis-cli ping`

### 4. Mitigation
- Rollback if deployment-related
- Scale up if capacity-related
- Disable feature flag if feature-related

### 5. Resolution
1. Verify service restored
2. Update status page
3. Notify stakeholders

### 6. Post-Incident
1. Schedule post-mortem within 48 hours
2. Create follow-up tickets
3. Update runbooks if needed

---

## Common Incidents

### INC-001: API 5xx Errors

**Symptoms:**
- `/health` returning errors
- Prometheus `http_requests_total{status="500"}` spike

**Diagnosis:**
```bash
# Check Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit=50

# Check active instances
gcloud run services describe velox-api-prod --region=europe-west2
```

**Resolution:**
1. If OOM: Increase memory limit in Cloud Run
2. If DB connection: Check Cloud SQL connections
3. If bad deployment: Rollback
   ```bash
   gcloud run services update-traffic velox-api-prod --to-revisions=PREVIOUS_REVISION=100
   ```

---

### INC-002: Voice Calls Failing

**Symptoms:**
- `velox_calls_total{status="FAILED"}` increasing
- Customer complaints about dropped calls

**Diagnosis:**
```bash
# Check Twilio status
curl https://status.twilio.com/api/v2/status.json

# Check Deepgram status
curl https://status.deepgram.com/api/v2/status.json

# Check agents service
curl http://localhost:8002/health
```

**Resolution:**
1. If Twilio outage: Nothing to do, monitor
2. If Deepgram outage: Consider failover TTS
3. If agents service down: Restart or scale
   ```bash
   gcloud run services update velox-agents-prod --min-instances=2
   ```

---

### INC-003: High Latency

**Symptoms:**
- `velox_e2e_latency_seconds` P95 > 3s
- Users experiencing slow responses

**Diagnosis:**
```bash
# Check which stage is slow
# In Grafana, compare:
# - velox_llm_latency_seconds
# - velox_tts_latency_seconds

# Check LLM API status
curl https://status.cloud.google.com/
```

**Resolution:**
1. If LLM slow: Check Google Cloud status, consider model downgrade
2. If TTS slow: Check Deepgram status
3. If DB slow: Check slow query logs, add indexes
4. If everything slow: Scale up instances

---

### INC-004: Billing Issues

**Symptoms:**
- Customers unable to make calls
- `hasMinutes` returning false incorrectly

**Diagnosis:**
```sql
-- Check organization balance
SELECT id, name, credit_balance, current_plan
FROM organizations
WHERE id = 'ORG_ID';

-- Check recent transactions
SELECT * FROM transactions
WHERE org_id = 'ORG_ID'
ORDER BY created_at DESC
LIMIT 10;
```

**Resolution:**
1. If balance incorrect: Manual credit adjustment
2. If Stripe webhook failed: Replay webhook
3. If subscription not synced: Sync from Stripe dashboard

---

### INC-005: Security Incident

**Symptoms:**
- Unusual API patterns
- Guardrails blocking elevated traffic
- Suspicious authentication attempts

**Immediate Actions:**
1. DO NOT acknowledge publicly until assessed
2. Preserve logs: `gcloud logging read "timestamp>=\"2024-01-01T00:00:00Z\"" > incident-logs.json`
3. Notify security team immediately

**Escalation:**
- Security Lead: security@velox.ai
- Legal: legal@velox.ai (if data breach suspected)

---

## Rollback Procedures

### Application Rollback
```bash
# List recent revisions
gcloud run revisions list --service=velox-api-prod --region=europe-west2

# Rollback to previous revision
gcloud run services update-traffic velox-api-prod \
  --to-revisions=velox-api-prod-REVISION_ID=100 \
  --region=europe-west2
```

### Database Rollback
```bash
# Prisma migration rollback (if migration caused issue)
npx prisma migrate resolve --rolled-back MIGRATION_NAME

# For data issues, restore from backup
gcloud sql backups restore BACKUP_ID --restore-instance=INSTANCE_NAME
```

### Feature Flag Rollback
```bash
# If using feature flags, disable the problematic feature
# Update environment variable
gcloud run services update velox-api-prod --set-env-vars=FEATURE_X_ENABLED=false
```

---

## Escalation Contacts

| Role | Contact | When to Contact |
|------|---------|-----------------|
| On-Call Engineer | PagerDuty | First responder |
| Engineering Lead | Slack @eng-lead | SEV1/SEV2, need decision |
| Security Team | security@velox.ai | Security incidents |
| Customer Success | Slack #customer-success | Customer-facing updates |
| Executive | Slack @leadership | SEV1 > 30 min, PR risk |

---

## Post-Incident Template

```markdown
# Post-Incident Review: [INCIDENT_TITLE]

**Date:** YYYY-MM-DD
**Duration:** X hours Y minutes
**Severity:** SEVX
**Incident Commander:** [Name]

## Summary
[1-2 sentence summary]

## Timeline
- HH:MM - Event description
- HH:MM - Event description

## Root Cause
[Technical explanation]

## Impact
- Users affected: X
- Calls dropped: Y
- Revenue impact: $Z

## Action Items
- [ ] [Action] - Owner - Due Date
- [ ] [Action] - Owner - Due Date

## Lessons Learned
- What went well
- What could be improved
```
