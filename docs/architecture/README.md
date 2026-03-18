# Architecture Reference Documentation

> Enterprise AI Architecture & System Design — 14-document reference library.

## Documents

| # | Document | Covers |
|---|----------|--------|
| 01 | [Infrastructure](01-infrastructure.md) | Cloud, GPU, IaC, containers, networking |
| 02 | [Data Platform](02-data-platform.md) | Lakehouse, ingestion, quality, medallion |
| 03 | [Feature Engineering](03-feature-engineering.md) | Feature store, computation, skew prevention |
| 04 | [Model Development](04-model-development.md) | Training, experiments, evaluation, distributed |
| 05 | [Model Serving](05-model-serving.md) | Inference engines, optimisation, deployment |
| 06 | [Application Layer](06-application-layer.md) | API, orchestration, guardrails, caching |
| 07 | [Governance & Monitoring](07-governance-monitoring.md) | Observability, security, compliance |
| 08 | [MLOps CI/CD](08-mlops-cicd.md) | Pipelines, testing, automation |
| 09 | [Cost Architecture](09-cost-architecture.md) | FinOps, optimisation, tracking |
| 10 | [Org Design](10-org-design.md) | Teams, roles, Conway's Law |
| 11 | [Reference Architectures](11-reference-architectures.md) | End-to-end examples |
| 12 | [Anti-Patterns](12-anti-patterns.md) | What NOT to do |
| 13 | [Decision Cheatsheet](13-decision-cheatsheet.md) | Technology selection matrix |
| 14 | [LLM Patterns](14-llm-patterns.md) | RAG, agents, fine-tuning, eval |

## Usage

1. Run `bash scripts/scan-project.sh` to audit your project
2. Read the scan report in `.audit/scan-report.md`
3. Reference relevant docs above for each layer that needs improvement
4. Follow the priority matrix in `CLAUDE.md` Phase 2

## With Claude Code

Paste into Claude Code:
```
Read CLAUDE.md. Scan my project. Generate the audit report. Then start fixing P0 issues using the architecture docs as reference.
```
