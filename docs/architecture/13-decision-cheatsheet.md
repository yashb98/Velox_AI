# Architecture Decision Cheat Sheet

> Quick-reference for common technology selection decisions.

---

| Decision | Option A | Option B | Choose A When | Choose B When |
|----------|----------|----------|---------------|---------------|
| Cloud | AWS | GCP | Enterprise deals; SageMaker | Vertex AI; BigQuery; TPUs |
| Orchestrator | Airflow | Dagster | Large team; mature ecosystem | Asset-centric; modern DX |
| Table Format | Delta Lake | Iceberg | Databricks shop | Vendor-neutral; multi-engine |
| Feature Store | Feast | Tecton | <50 models; open-source | Enterprise; streaming features |
| Experiment Track | MLflow | W&B | Self-hosted; integrated registry | Better UX; collaboration |
| LLM Serving | vLLM | TGI | Max throughput; PagedAttention | HF ecosystem; grammar output |
| Vector DB | Qdrant | Pinecone | Self-hosted; open-source | Fully managed; serverless |
| LLM Framework | LangGraph | CrewAI | Complex agents; state machines | Quick prototyping; role-based |
| Streaming | Kafka | Pulsar | Mature; largest ecosystem | Multi-tenancy; geo-replication |
| Python Linter | Ruff | Pylint | Speed; modern; all-in-one | Legacy codebase compatibility |
| Type Checker | mypy | Pyright | Standard; widest adoption | Speed; VSCode integration |
| API Framework | FastAPI | Flask | Modern; async; auto-docs | Simple; maximum ecosystem |
| Container Orch | Kubernetes | Docker Compose | Production; multi-node | Dev/staging; single node |
| LLM Provider | Anthropic Claude | OpenAI GPT | Reasoning; safety; long context | Ecosystem; multimodal; fine-tuning |
| Embedding Model | BGE-large | Cohere embed | Self-hosted; open-source | API convenience; multilingual |
| CI/CD | GitHub Actions | GitLab CI | GitHub-hosted repos | Self-hosted; GitLab ecosystem |
