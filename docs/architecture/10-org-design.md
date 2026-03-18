# Organisational Design for AI Teams

> Reference for team topology, roles, and Conway's Law implications.

---

## 10.1 Team Topologies

| Model | Structure | Best For | Risk |
|-------|-----------|----------|------|
| Centralised Platform | Single team owns all AI | <20 ML engineers; consistency | Bottleneck |
| Embedded Engineers | ML in product teams; shared platform | Large orgs; fast iteration | Fragmentation |
| Hub-and-Spoke | Central platform + embedded | Enterprise 50+ engineers | Coordination overhead |

---

## 10.2 Key Roles

| Role | Responsibility | Skills | Reports To |
|------|---------------|--------|-----------|
| ML Engineer | Build, train, deploy models | PyTorch, MLOps, SWE | ML Platform / Product |
| Data Scientist | Analysis, experimentation | Stats, Python, SQL | Analytics / Product |
| Data Engineer | Pipelines, quality, features | Spark, Kafka, Airflow | Data Platform |
| ML Platform Eng | Infrastructure (train/serve/monitor) | K8s, Terraform, GPU | Platform Engineering |
| AI Researcher | Novel architectures | DL theory, papers | Research |
| AI Product Manager | Strategy, requirements | ML literacy, business | Product |
| ML Architect | System design, standards | Breadth, trade-offs | CTO |
| Responsible AI Lead | Fairness, compliance | Ethics, regulation | Legal / CTO |

---

## 10.3 Conway's Law for AI

Your architecture will mirror your team structure. If data engineering and ML engineering are separate silos, you will get a fragmented data-to-model pipeline. The solution:

- **Platform team** owns the horizontal layers (infra, data, MLOps)
- **Product ML teams** own vertical slices (specific models and features)
- **Shared interfaces** (feature store API, model serving API) prevent tight coupling
