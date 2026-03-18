#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# PROJECT SCANNER — Enterprise AI Architecture Audit Engine
# ═══════════════════════════════════════════════════════════════
# Usage: bash scripts/scan-project.sh [project-root]
# Output: .audit/project-scan.json + .audit/scan-report.md
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

PROJECT_ROOT="${1:-.}"
AUDIT_DIR="$PROJECT_ROOT/.audit"
SCAN_FILE="$AUDIT_DIR/project-scan.json"
REPORT_FILE="$AUDIT_DIR/scan-report.md"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

mkdir -p "$AUDIT_DIR"

echo "╔═══════════════════════════════════════════════╗"
echo "║  Enterprise AI Architecture Scanner v3.0      ║"
echo "║  Scanning: $PROJECT_ROOT"
echo "║  Time: $TIMESTAMP"
echo "╚═══════════════════════════════════════════════╝"
echo ""

# ─── Helper Functions ─────────────────────────────────────────

count_files() {
  find "$PROJECT_ROOT" -name "$1" \
    -not -path '*/node_modules/*' \
    -not -path '*/.git/*' \
    -not -path '*/__pycache__/*' \
    -not -path '*/.venv/*' \
    -not -path '*/venv/*' \
    -not -path '*/dist/*' \
    -not -path '*/build/*' \
    -not -path '*/.next/*' \
    -not -path '*/.audit/*' \
    2>/dev/null | wc -l | tr -d ' '
}

file_exists() {
  [ -f "$PROJECT_ROOT/$1" ] && echo "true" || echo "false"
}

dir_exists() {
  [ -d "$PROJECT_ROOT/$1" ] && echo "true" || echo "false"
}

grep_in_files() {
  grep -rl "$1" "$PROJECT_ROOT" \
    --include="$2" \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=__pycache__ \
    --exclude-dir=venv \
    --exclude-dir=.venv \
    2>/dev/null | wc -l | tr -d ' '
}

# ─── 1. STRUCTURE SCAN ───────────────────────────────────────

echo "📁 [1/10] Scanning directory structure..."

TOTAL_FILES=$(find "$PROJECT_ROOT" -type f \
  -not -path '*/node_modules/*' \
  -not -path '*/.git/*' \
  -not -path '*/__pycache__/*' \
  -not -path '*/.venv/*' \
  -not -path '*/venv/*' \
  -not -path '*/dist/*' \
  -not -path '*/build/*' \
  2>/dev/null | wc -l | tr -d ' ')

PYTHON_FILES=$(count_files "*.py")
JS_FILES=$(count_files "*.js")
TS_FILES=$(count_files "*.ts")
JSX_FILES=$(count_files "*.jsx")
TSX_FILES=$(count_files "*.tsx")
YAML_FILES=$(count_files "*.yaml" ; count_files "*.yml")
DOCKER_FILES=$(count_files "Dockerfile*")
TF_FILES=$(count_files "*.tf")
PROTO_FILES=$(count_files "*.proto")
MD_FILES=$(count_files "*.md")
TEST_FILES=$(find "$PROJECT_ROOT" -name "test_*.py" -o -name "*_test.py" -o -name "*.test.ts" -o -name "*.test.js" -o -name "*.spec.ts" -o -name "*.spec.js" \
  -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | wc -l | tr -d ' ')

TOTAL_PYTHON_LOC=0
if [ "$PYTHON_FILES" -gt 0 ]; then
  TOTAL_PYTHON_LOC=$(find "$PROJECT_ROOT" -name "*.py" \
    -not -path '*/node_modules/*' -not -path '*/.git/*' \
    -not -path '*/__pycache__/*' -not -path '*/venv/*' -not -path '*/.venv/*' \
    -exec cat {} + 2>/dev/null | wc -l | tr -d ' ')
fi

# ─── 2. TECH STACK DETECTION ─────────────────────────────────

echo "🔧 [2/10] Detecting tech stack..."

HAS_PYTHON=$(file_exists "requirements.txt")
HAS_PYPROJECT=$(file_exists "pyproject.toml")
HAS_POETRY=$(file_exists "poetry.lock")
HAS_NODE=$(file_exists "package.json")
HAS_RUST=$(file_exists "Cargo.toml")
HAS_GO=$(file_exists "go.mod")
HAS_DOCKER=$(file_exists "Dockerfile")
HAS_COMPOSE=$([ -f "$PROJECT_ROOT/docker-compose.yml" ] || [ -f "$PROJECT_ROOT/docker-compose.yaml" ] && echo "true" || echo "false")
HAS_K8S=$(dir_exists "k8s" ; dir_exists "kubernetes" ; dir_exists "helm")
HAS_TERRAFORM=$([ "$TF_FILES" -gt 0 ] && echo "true" || echo "false")
HAS_MAKEFILE=$(file_exists "Makefile")

# ─── 3. AI/ML STACK DETECTION ────────────────────────────────

echo "🤖 [3/10] Detecting AI/ML stack..."

detect_dep() {
  local dep="$1"
  grep -q "$dep" "$PROJECT_ROOT/requirements.txt" 2>/dev/null || \
  grep -q "$dep" "$PROJECT_ROOT/pyproject.toml" 2>/dev/null || \
  grep -q "$dep" "$PROJECT_ROOT/setup.py" 2>/dev/null || \
  grep -q "$dep" "$PROJECT_ROOT/setup.cfg" 2>/dev/null || \
  grep -q "\"$dep\"" "$PROJECT_ROOT/package.json" 2>/dev/null
}

# Frameworks
HAS_PYTORCH=$(detect_dep "torch" && echo "true" || echo "false")
HAS_TENSORFLOW=$(detect_dep "tensorflow" && echo "true" || echo "false")
HAS_SKLEARN=$(detect_dep "scikit-learn" && echo "true" || echo "false")
HAS_XGBOOST=$(detect_dep "xgboost" && echo "true" || echo "false")

# LLM Stack
HAS_LANGCHAIN=$(detect_dep "langchain" && echo "true" || echo "false")
HAS_LANGGRAPH=$(detect_dep "langgraph" && echo "true" || echo "false")
HAS_OPENAI_SDK=$(detect_dep "openai" && echo "true" || echo "false")
HAS_ANTHROPIC_SDK=$(detect_dep "anthropic" && echo "true" || echo "false")
HAS_VLLM=$(detect_dep "vllm" && echo "true" || echo "false")
HAS_TRANSFORMERS=$(detect_dep "transformers" && echo "true" || echo "false")
HAS_LLAMAINDEX=$(detect_dep "llama-index" && echo "true" || echo "false")

# Data Stack
HAS_PANDAS=$(detect_dep "pandas" && echo "true" || echo "false")
HAS_POLARS=$(detect_dep "polars" && echo "true" || echo "false")
HAS_SPARK=$(detect_dep "pyspark" && echo "true" || echo "false")
HAS_KAFKA=$(detect_dep "kafka" && echo "true" || echo "false")
HAS_DBT=$(detect_dep "dbt" && echo "true" || echo "false")

# Vector DBs
HAS_QDRANT=$(detect_dep "qdrant" && echo "true" || echo "false")
HAS_PINECONE=$(detect_dep "pinecone" && echo "true" || echo "false")
HAS_WEAVIATE=$(detect_dep "weaviate" && echo "true" || echo "false")
HAS_CHROMADB=$(detect_dep "chromadb" && echo "true" || echo "false")

# MLOps
HAS_MLFLOW=$(detect_dep "mlflow" && echo "true" || echo "false")
HAS_WANDB=$(detect_dep "wandb" && echo "true" || echo "false")
HAS_LANGFUSE=$(detect_dep "langfuse" && echo "true" || echo "false")
HAS_FEAST=$(detect_dep "feast" && echo "true" || echo "false")

# Serving
HAS_FASTAPI=$(detect_dep "fastapi" && echo "true" || echo "false")
HAS_FLASK=$(detect_dep "flask" && echo "true" || echo "false")
HAS_GRPC=$(detect_dep "grpcio" && echo "true" || echo "false")

# ─── 4. QUALITY SIGNALS ──────────────────────────────────────

echo "✅ [4/10] Checking code quality signals..."

HAS_PRECOMMIT=$(file_exists ".pre-commit-config.yaml")
HAS_RUFF=$(detect_dep "ruff" && echo "true" || echo "false")
HAS_MYPY=$(detect_dep "mypy" && echo "true" || echo "false")
HAS_BLACK=$(detect_dep "black" && echo "true" || echo "false")
HAS_PYTEST=$(detect_dep "pytest" && echo "true" || echo "false")
HAS_ESLINT=$(file_exists ".eslintrc.js" ; file_exists ".eslintrc.json" ; file_exists ".eslintrc.yml")
HAS_PRETTIER=$(file_exists ".prettierrc" ; file_exists ".prettierrc.json")
HAS_EDITORCONFIG=$(file_exists ".editorconfig")

# Type hints coverage (sample)
TYPE_HINT_SCORE=0
if [ "$PYTHON_FILES" -gt 0 ]; then
  TYPED_FILES=$(grep_in_files "def.*->.*:" "*.py")
  if [ "$PYTHON_FILES" -gt 0 ]; then
    TYPE_HINT_SCORE=$((TYPED_FILES * 100 / PYTHON_FILES))
  fi
fi

# ─── 5. SECURITY SIGNALS ─────────────────────────────────────

echo "🔒 [5/10] Checking security signals..."

HAS_GITIGNORE=$(file_exists ".gitignore")
HAS_ENV_EXAMPLE=$(file_exists ".env.example")
HAS_SECRETS_IN_CODE="false"
HARDCODED_SECRETS=$(grep -rnE '(api_key|secret_key|password|token)\s*=\s*["\x27][A-Za-z0-9]' "$PROJECT_ROOT" \
  --include="*.py" --include="*.js" --include="*.ts" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=venv \
  2>/dev/null | grep -v "example\|placeholder\|test\|mock\|YOUR_\|xxx\|CHANGEME" | wc -l | tr -d ' ')
if [ "$HARDCODED_SECRETS" -gt 0 ]; then
  HAS_SECRETS_IN_CODE="true"
fi

# ─── 6. INFRASTRUCTURE SIGNALS ───────────────────────────────

echo "🏗️  [6/10] Checking infrastructure signals..."

HAS_CI_GITHUB=$(dir_exists ".github/workflows")
HAS_CI_GITLAB=$(file_exists ".gitlab-ci.yml")
HAS_CI_CIRCLE=$(file_exists ".circleci/config.yml")
HAS_HEALTHCHECK=$(grep_in_files "health" "*.py")
HAS_ENV_MGMT=$(file_exists ".env.example" ; file_exists "config/settings.py" ; file_exists "src/config.py")

# ─── 7. MONITORING SIGNALS ───────────────────────────────────

echo "📊 [7/10] Checking monitoring signals..."

HAS_PROMETHEUS=$(detect_dep "prometheus" && echo "true" || echo "false")
HAS_STRUCTURED_LOGGING=$(grep_in_files "structlog\|logging.config\|loguru" "*.py")
HAS_SENTRY=$(detect_dep "sentry" && echo "true" || echo "false")
HAS_OPENTELEMETRY=$(detect_dep "opentelemetry" && echo "true" || echo "false")

# ─── 8. DOCUMENTATION SIGNALS ────────────────────────────────

echo "📖 [8/10] Checking documentation signals..."

HAS_README=$(file_exists "README.md")
HAS_CONTRIBUTING=$(file_exists "CONTRIBUTING.md")
HAS_CHANGELOG=$(file_exists "CHANGELOG.md")
HAS_API_DOCS=$(dir_exists "docs" ; file_exists "openapi.yaml" ; file_exists "openapi.json")
HAS_ARCH_DOCS=$(dir_exists "docs/architecture")

# ─── 9. CALCULATE LAYER SCORES ───────────────────────────────

echo "🧮 [9/10] Calculating layer scores..."

# L1: Infrastructure (0-10)
L1_SCORE=0
[ "$HAS_DOCKER" = "true" ] && L1_SCORE=$((L1_SCORE + 2))
[ "$HAS_COMPOSE" = "true" ] && L1_SCORE=$((L1_SCORE + 1))
[ "$HAS_CI_GITHUB" = "true" ] || [ "$HAS_CI_GITLAB" = "true" ] && L1_SCORE=$((L1_SCORE + 2))
[ "$HAS_TERRAFORM" = "true" ] && L1_SCORE=$((L1_SCORE + 2))
[ "$HAS_MAKEFILE" = "true" ] && L1_SCORE=$((L1_SCORE + 1))
[ "$HAS_GITIGNORE" = "true" ] && L1_SCORE=$((L1_SCORE + 1))
[ "$HAS_ENV_EXAMPLE" = "true" ] && L1_SCORE=$((L1_SCORE + 1))

# L4: Model Development (0-10)
L4_SCORE=0
[ "$HAS_MLFLOW" = "true" ] || [ "$HAS_WANDB" = "true" ] && L4_SCORE=$((L4_SCORE + 2))
[ "$HAS_LANGFUSE" = "true" ] && L4_SCORE=$((L4_SCORE + 2))
[ "$HAS_PYTORCH" = "true" ] || [ "$HAS_TRANSFORMERS" = "true" ] && L4_SCORE=$((L4_SCORE + 1))
[ "$HAS_VLLM" = "true" ] && L4_SCORE=$((L4_SCORE + 2))

# L6: Application Layer (0-10)
L6_SCORE=0
[ "$HAS_FASTAPI" = "true" ] || [ "$HAS_FLASK" = "true" ] && L6_SCORE=$((L6_SCORE + 2))
[ "$HAS_LANGGRAPH" = "true" ] || [ "$HAS_LANGCHAIN" = "true" ] && L6_SCORE=$((L6_SCORE + 2))
[ "$HAS_QDRANT" = "true" ] || [ "$HAS_PINECONE" = "true" ] || [ "$HAS_CHROMADB" = "true" ] && L6_SCORE=$((L6_SCORE + 2))

# L7: Governance (0-10)
L7_SCORE=0
[ "$HAS_PYTEST" = "true" ] && L7_SCORE=$((L7_SCORE + 2))
[ "$HAS_PRECOMMIT" = "true" ] && L7_SCORE=$((L7_SCORE + 1))
[ "$HAS_RUFF" = "true" ] || [ "$HAS_MYPY" = "true" ] && L7_SCORE=$((L7_SCORE + 1))
[ "$HAS_PROMETHEUS" = "true" ] || [ "$HAS_OPENTELEMETRY" = "true" ] && L7_SCORE=$((L7_SCORE + 2))
[ "$HAS_STRUCTURED_LOGGING" -gt 0 ] 2>/dev/null && L7_SCORE=$((L7_SCORE + 1))
[ "$TEST_FILES" -gt 5 ] && L7_SCORE=$((L7_SCORE + 2))

# Cross-cutting quality
QUALITY_SCORE=0
[ "$HAS_README" = "true" ] && QUALITY_SCORE=$((QUALITY_SCORE + 1))
[ "$HAS_ARCH_DOCS" = "true" ] && QUALITY_SCORE=$((QUALITY_SCORE + 2))
[ "$TYPE_HINT_SCORE" -gt 50 ] && QUALITY_SCORE=$((QUALITY_SCORE + 2))
[ "$HAS_PRECOMMIT" = "true" ] && QUALITY_SCORE=$((QUALITY_SCORE + 1))
[ "$TEST_FILES" -gt 10 ] && QUALITY_SCORE=$((QUALITY_SCORE + 2))
[ "$HAS_SECRETS_IN_CODE" = "false" ] && QUALITY_SCORE=$((QUALITY_SCORE + 2))

# Cap scores at 10
cap() { [ "$1" -gt 10 ] && echo 10 || echo "$1"; }
L1_SCORE=$(cap $L1_SCORE)
L4_SCORE=$(cap $L4_SCORE)
L6_SCORE=$(cap $L6_SCORE)
L7_SCORE=$(cap $L7_SCORE)
QUALITY_SCORE=$(cap $QUALITY_SCORE)

OVERALL_SCORE=$(( (L1_SCORE + L4_SCORE + L6_SCORE + L7_SCORE + QUALITY_SCORE) / 5 ))

# ─── 10. GENERATE REPORTS ────────────────────────────────────

echo "📝 [10/10] Generating reports..."

# JSON Report
cat > "$SCAN_FILE" << ENDJSON
{
  "scan_metadata": {
    "timestamp": "$TIMESTAMP",
    "project_root": "$PROJECT_ROOT",
    "scanner_version": "3.0"
  },
  "structure": {
    "total_files": $TOTAL_FILES,
    "python_files": $PYTHON_FILES,
    "python_loc": $TOTAL_PYTHON_LOC,
    "js_ts_files": $(( ${JS_FILES:-0} + ${TS_FILES:-0} + ${JSX_FILES:-0} + ${TSX_FILES:-0} )),
    "test_files": $TEST_FILES,
    "docker_files": ${DOCKER_FILES:-0},
    "terraform_files": ${TF_FILES:-0},
    "md_files": ${MD_FILES:-0}
  },
  "tech_stack": {
    "languages": {
      "python": $HAS_PYTHON, "node": $HAS_NODE, "rust": $HAS_RUST, "go": $HAS_GO
    },
    "ml_frameworks": {
      "pytorch": $HAS_PYTORCH, "tensorflow": $HAS_TENSORFLOW, "sklearn": $HAS_SKLEARN,
      "transformers": $HAS_TRANSFORMERS, "vllm": $HAS_VLLM
    },
    "llm_stack": {
      "langchain": $HAS_LANGCHAIN, "langgraph": $HAS_LANGGRAPH,
      "openai": $HAS_OPENAI_SDK, "anthropic": $HAS_ANTHROPIC_SDK,
      "llamaindex": $HAS_LLAMAINDEX
    },
    "vector_dbs": {
      "qdrant": $HAS_QDRANT, "pinecone": $HAS_PINECONE,
      "weaviate": $HAS_WEAVIATE, "chromadb": $HAS_CHROMADB
    },
    "data_stack": {
      "pandas": $HAS_PANDAS, "polars": $HAS_POLARS, "spark": $HAS_SPARK,
      "kafka": $HAS_KAFKA, "dbt": $HAS_DBT
    },
    "mlops": {
      "mlflow": $HAS_MLFLOW, "wandb": $HAS_WANDB, "langfuse": $HAS_LANGFUSE, "feast": $HAS_FEAST
    },
    "serving": {
      "fastapi": $HAS_FASTAPI, "flask": $HAS_FLASK, "grpc": $HAS_GRPC
    },
    "infrastructure": {
      "docker": $HAS_DOCKER, "compose": $HAS_COMPOSE,
      "terraform": $HAS_TERRAFORM, "makefile": $HAS_MAKEFILE
    }
  },
  "quality": {
    "testing": { "pytest": $HAS_PYTEST, "test_files": $TEST_FILES },
    "linting": { "ruff": $HAS_RUFF, "mypy": $HAS_MYPY, "precommit": $HAS_PRECOMMIT },
    "type_hint_coverage_pct": $TYPE_HINT_SCORE,
    "security": {
      "gitignore": $HAS_GITIGNORE,
      "env_example": $HAS_ENV_EXAMPLE,
      "hardcoded_secrets_found": $HAS_SECRETS_IN_CODE
    },
    "documentation": {
      "readme": $HAS_README, "contributing": $HAS_CONTRIBUTING,
      "changelog": $HAS_CHANGELOG, "api_docs": $HAS_API_DOCS,
      "architecture_docs": $HAS_ARCH_DOCS
    },
    "monitoring": {
      "prometheus": $HAS_PROMETHEUS, "opentelemetry": $HAS_OPENTELEMETRY,
      "structured_logging": $([ "${HAS_STRUCTURED_LOGGING:-0}" -gt 0 ] 2>/dev/null && echo "true" || echo "false"),
      "sentry": $HAS_SENTRY
    },
    "ci_cd": {
      "github_actions": $HAS_CI_GITHUB, "gitlab_ci": $HAS_CI_GITLAB
    }
  },
  "scores": {
    "L1_infrastructure": $L1_SCORE,
    "L4_model_development": $L4_SCORE,
    "L6_application_layer": $L6_SCORE,
    "L7_governance": $L7_SCORE,
    "cross_cutting_quality": $QUALITY_SCORE,
    "overall": $OVERALL_SCORE
  }
}
ENDJSON

# Markdown Report
cat > "$REPORT_FILE" << ENDMD
# Project Scan Report

**Scanned**: $TIMESTAMP
**Project**: $PROJECT_ROOT
**Overall Score**: **$OVERALL_SCORE / 10**

---

## Layer Scores

| Layer | Score | Status |
|-------|-------|--------|
| L1: Infrastructure | $L1_SCORE/10 | $([ $L1_SCORE -ge 7 ] && echo "✅ Strong" || ([ $L1_SCORE -ge 4 ] && echo "⚠️ Needs Work" || echo "🔴 Critical")) |
| L4: Model Development | $L4_SCORE/10 | $([ $L4_SCORE -ge 7 ] && echo "✅ Strong" || ([ $L4_SCORE -ge 4 ] && echo "⚠️ Needs Work" || echo "🔴 Critical")) |
| L6: Application Layer | $L6_SCORE/10 | $([ $L6_SCORE -ge 7 ] && echo "✅ Strong" || ([ $L6_SCORE -ge 4 ] && echo "⚠️ Needs Work" || echo "🔴 Critical")) |
| L7: Governance & Ops | $L7_SCORE/10 | $([ $L7_SCORE -ge 7 ] && echo "✅ Strong" || ([ $L7_SCORE -ge 4 ] && echo "⚠️ Needs Work" || echo "🔴 Critical")) |
| Cross-Cutting Quality | $QUALITY_SCORE/10 | $([ $QUALITY_SCORE -ge 7 ] && echo "✅ Strong" || ([ $QUALITY_SCORE -ge 4 ] && echo "⚠️ Needs Work" || echo "🔴 Critical")) |

## Codebase Stats

- **Total files**: $TOTAL_FILES
- **Python files**: $PYTHON_FILES ($TOTAL_PYTHON_LOC LOC)
- **Test files**: $TEST_FILES
- **Type hint coverage**: ~${TYPE_HINT_SCORE}%

## Detected Stack

$([ "$HAS_PYTORCH" = "true" ] && echo "- PyTorch")
$([ "$HAS_TRANSFORMERS" = "true" ] && echo "- HuggingFace Transformers")
$([ "$HAS_VLLM" = "true" ] && echo "- vLLM")
$([ "$HAS_LANGCHAIN" = "true" ] && echo "- LangChain")
$([ "$HAS_LANGGRAPH" = "true" ] && echo "- LangGraph")
$([ "$HAS_LANGFUSE" = "true" ] && echo "- Langfuse")
$([ "$HAS_QDRANT" = "true" ] && echo "- Qdrant")
$([ "$HAS_FASTAPI" = "true" ] && echo "- FastAPI")
$([ "$HAS_DOCKER" = "true" ] && echo "- Docker")
$([ "$HAS_MLFLOW" = "true" ] && echo "- MLflow")

## Security Alerts

$([ "$HAS_SECRETS_IN_CODE" = "true" ] && echo "🔴 **CRITICAL**: Hardcoded secrets detected in source code!" || echo "✅ No hardcoded secrets detected")
$([ "$HAS_GITIGNORE" = "false" ] && echo "⚠️ No .gitignore found" || echo "✅ .gitignore present")

## Next Steps

Refer to CLAUDE.md Phase 2 for the priority matrix. Start with P0 fixes.

---
*Generated by Enterprise AI Architecture Scanner v3.0*
ENDMD

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║  ✅ Scan Complete!                             ║"
echo "║                                               ║"
echo "║  Overall Score: $OVERALL_SCORE / 10                         ║"
echo "║                                               ║"
echo "║  Reports:                                     ║"
echo "║  → $SCAN_FILE"
echo "║  → $REPORT_FILE"
echo "╚═══════════════════════════════════════════════╝"
