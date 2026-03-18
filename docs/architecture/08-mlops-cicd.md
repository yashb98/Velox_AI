# L7+: MLOps CI/CD Pipeline

> Reference for ML-specific CI/CD, testing strategy, and deployment automation.

---

## 8.1 ML CI/CD Pipeline Stages

| Stage | What Runs | Gate | Tooling |
|-------|----------|------|---------|
| Code Quality | Lint, type check, unit tests | Pass; coverage>80% | Ruff, mypy, pytest |
| Data Validation | Schema, quality, drift | All checks pass | Great Expectations, dbt |
| Model Training | Train on latest data | Completes without error | Kubeflow / Vertex / custom |
| Model Evaluation | Offline metrics on holdout | Above thresholds | MLflow eval, custom |
| Fairness Testing | Bias across groups | Within tolerance | Fairlearn, Aequitas |
| Integration Test | E2E API tests | Pass; latency<SLA | pytest + httpx, Locust |
| Staging Deploy | Deploy + smoke test | Smoke pass; no errors | ArgoCD / Helm |
| Canary Deploy | 5%→25%→50%→100% | No regression | Istio / Argo Rollouts |

---

## 8.2 GitHub Actions Templates

### CI Pipeline

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - run: pip install ruff mypy pytest pytest-cov
      - run: ruff check .
      - run: ruff format --check .
      - run: mypy src/ --ignore-missing-imports
      - run: pytest tests/ --cov=src --cov-report=term-missing --cov-fail-under=80
```

### Model Evaluation Pipeline

```yaml
# .github/workflows/model-eval.yml
name: Model Evaluation
on:
  workflow_dispatch:
  schedule:
    - cron: '0 6 * * 1'  # Weekly Monday 6am

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pip install -r requirements.txt
      - run: python scripts/evaluate_model.py
      - run: python scripts/check_thresholds.py
      - uses: actions/upload-artifact@v4
        with:
          name: eval-report
          path: reports/evaluation_*.html
```

---

## 8.3 Testing Strategy

| Test Type | What | When | Coverage Target |
|-----------|------|------|----------------|
| Unit | Individual functions, utils | Every commit | >80% |
| Integration | API endpoints, DB queries | Every PR | Key paths |
| Model Eval | Offline metrics on holdout | Pre-deploy | Thresholds defined |
| Fairness | Bias across demographics | Pre-deploy | Within tolerance |
| Load | Throughput, latency at scale | Pre-release | Meet SLA |
| E2E Smoke | Full request flow | Post-deploy | Critical paths |

### Testing Structure

```
tests/
├── conftest.py           # Shared fixtures
├── unit/
│   ├── test_preprocessing.py
│   ├── test_feature_engineering.py
│   └── test_guardrails.py
├── integration/
│   ├── test_api_endpoints.py
│   ├── test_model_serving.py
│   └── test_database.py
├── eval/
│   ├── test_model_accuracy.py
│   ├── test_model_fairness.py
│   └── test_model_latency.py
└── e2e/
    └── test_full_pipeline.py
```

---

## 8.4 Pre-commit Configuration

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.8.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
        args: ['--maxkb=1000']
      - id: detect-private-key
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.11.0
    hooks:
      - id: mypy
        additional_dependencies: [types-requests, pydantic]
```

---

## Audit Checklist

- [ ] CI pipeline runs on every push/PR
- [ ] Linting + formatting enforced
- [ ] Type checking enforced
- [ ] Unit tests with >80% coverage
- [ ] Integration tests for key API paths
- [ ] Model evaluation as gated pipeline stage
- [ ] Pre-commit hooks configured
- [ ] Deployment is automated (not manual)
- [ ] Rollback procedure documented and tested
