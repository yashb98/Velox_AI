#!/usr/bin/env bash
# =============================================================================
# Velox AI — Phase 0b: Documentation Update Script
# =============================================================================
# Run AFTER cleanup-migration.sh.
# Updates files that are partially stale (not fully deleted).
#
# Usage:
#   chmod +x scripts/update-docs.sh
#   ./scripts/update-docs.sh
# =============================================================================

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UPDATED=()

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Velox AI — Phase 0b: Documentation Updates${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 1. RENAME architecture docs that are being replaced
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[1/5] Renaming architecture docs for new numbering...${NC}"

ARCH_DIR="$REPO_ROOT/docs/architecture"

# Helper function to prepend header (macOS compatible)
prepend_header() {
  local file="$1"
  local header="$2"
  local tmp="${file}.tmp"
  echo "$header" | cat - "$file" > "$tmp" && mv "$tmp" "$file"
}

# Keep and renumber the good ones
if [ -f "$ARCH_DIR/01-infrastructure.md" ]; then
  echo -e "  ${YELLOW}⚠ NEEDS REWRITE${NC}: 01-infrastructure.md — currently GCP-specific, needs Modal/Railway"
  prepend_header "$ARCH_DIR/01-infrastructure.md" "<!-- ⚠️ STALE: This doc references GCP. Rewrite for Modal + Railway + Neon + Upstash -->"
  UPDATED+=("01-infrastructure.md — marked as STALE, needs rewrite")
fi

if [ -f "$ARCH_DIR/05-model-serving.md" ]; then
  prepend_header "$ARCH_DIR/05-model-serving.md" "<!-- ⚠️ STALE: Rewrite as voice-pipeline doc with Pipecat architecture -->"
  UPDATED+=("05-model-serving.md — marked as STALE, needs rewrite as voice-pipeline")
fi

if [ -f "$ARCH_DIR/06-application-layer.md" ]; then
  prepend_header "$ARCH_DIR/06-application-layer.md" "<!-- ⚠️ STALE: Rewrite as model-routing doc with T0-T3 strategy -->"
  UPDATED+=("06-application-layer.md — marked as STALE, needs rewrite")
fi

if [ -f "$ARCH_DIR/07-governance-monitoring.md" ]; then
  prepend_header "$ARCH_DIR/07-governance-monitoring.md" "<!-- ⚠️ STALE: Rewrite as observability doc with LangSmith + Prometheus -->"
  UPDATED+=("07-governance-monitoring.md — marked as STALE, needs rewrite")
fi

if [ -f "$ARCH_DIR/15-advanced-rag-architecture.md" ]; then
  prepend_header "$ARCH_DIR/15-advanced-rag-architecture.md" "<!-- ⚠️ STALE: Replace with voice-optimised 2-tier RAG doc -->"
  UPDATED+=("15-advanced-rag-architecture.md — marked as STALE, needs voice-optimised replacement")
fi

# ─────────────────────────────────────────────────────────────────────────────
# 2. UPDATE decision cheatsheet (fix LLM serving entry)
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[2/5] Updating decision cheatsheet...${NC}"

if [ -f "$ARCH_DIR/13-decision-cheatsheet.md" ]; then
  # Replace vLLM vs TGI entry with SGLang vs vLLM (macOS compatible)
  tmp_file="$ARCH_DIR/13-decision-cheatsheet.md.tmp"
  sed 's/| LLM Serving | vLLM | TGI | Max throughput; PagedAttention | HF ecosystem; grammar output |/| LLM Serving | SGLang | vLLM | Max throughput; RadixAttention; voice workloads | Ecosystem maturity; broader hardware support |/' \
    "$ARCH_DIR/13-decision-cheatsheet.md" > "$tmp_file" && mv "$tmp_file" "$ARCH_DIR/13-decision-cheatsheet.md"
  UPDATED+=("13-decision-cheatsheet.md — updated LLM Serving: SGLang vs vLLM (TGI deprecated)")
fi

# ─────────────────────────────────────────────────────────────────────────────
# 3. UPDATE .env.example
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[3/5] Flagging .env.example for update...${NC}"

if [ -f "$REPO_ROOT/.env.example" ]; then
  echo -e "  ${YELLOW}⚠ MANUAL UPDATE NEEDED${NC}: .env.example"
  echo "    Replace with the env vars from CLAUDE.md Section 8"
  UPDATED+=(".env.example — needs manual replacement with new env vars")
fi

# ─────────────────────────────────────────────────────────────────────────────
# 4. FLAG files that need code changes (not doc changes)
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[4/5] Flagging source files needing refactoring...${NC}"

echo ""
echo -e "  ${CYAN}Files needing Gemini/ADK removal (Phase 2-3):${NC}"

# Find files with Google imports
grep -rn "google\.\|@google-cloud\|gemini\|GEMINI_API_KEY\|google-generativeai\|google\.adk" \
  "$REPO_ROOT/velox-api/src" "$REPO_ROOT/agents" \
  --include="*.ts" --include="*.py" \
  -l 2>/dev/null | while read -r f; do
    relpath="${f#$REPO_ROOT/}"
    echo "    → $relpath"
done

echo ""
echo -e "  ${CYAN}Files referencing Deepgram (Phase 1 — voice migration):${NC}"
grep -rn "deepgram\|DEEPGRAM" \
  "$REPO_ROOT/velox-api/src" \
  --include="*.ts" \
  -l 2>/dev/null | while read -r f; do
    relpath="${f#$REPO_ROOT/}"
    echo "    → $relpath"
done

echo ""
echo -e "  ${CYAN}WebSocket voice handling (Phase 1 — moves to Pipecat):${NC}"
if [ -d "$REPO_ROOT/velox-api/src/websocket" ]; then
  find "$REPO_ROOT/velox-api/src/websocket" -type f | while read -r f; do
    relpath="${f#$REPO_ROOT/}"
    echo "    → $relpath"
  done
fi

# ─────────────────────────────────────────────────────────────────────────────
# 5. FLAG fine-tuning for rewrite
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[5/5] Flagging fine-tuning for rewrite...${NC}"

if [ -f "$REPO_ROOT/fine-tuning/train.py" ]; then
  echo -e "  ${YELLOW}⚠ REWRITE NEEDED${NC}: fine-tuning/train.py — currently targets Phi-3 + Gemini API"
  echo "    Replace with Unsloth/Llama-Factory training for Nemotron/Qwen"
  UPDATED+=("fine-tuning/train.py — rewrite for open-weight models")
fi

if [ -f "$REPO_ROOT/fine-tuning/export_training_data.py" ]; then
  echo -e "  ${GREEN}✓ KEEP${NC}: fine-tuning/export_training_data.py — DB export logic is reusable"
fi

if [ -f "$REPO_ROOT/fine-tuning/README.md" ]; then
  echo -e "  ${YELLOW}⚠ REWRITE NEEDED${NC}: fine-tuning/README.md — references Cloud Run, Gemini"
  UPDATED+=("fine-tuning/README.md — rewrite for new training pipeline")
fi

if [ -f "$REPO_ROOT/fine-tuning/Dockerfile" ]; then
  echo -e "  ${YELLOW}⚠ REWRITE NEEDED${NC}: fine-tuning/Dockerfile — targets Phi-3 CUDA"
  UPDATED+=("fine-tuning/Dockerfile — rewrite for Unsloth base image")
fi

# ─────────────────────────────────────────────────────────────────────────────
# REPORT
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  UPDATE SCAN COMPLETE${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}Updated/flagged ${#UPDATED[@]} items:${NC}"
for item in "${UPDATED[@]}"; do
  echo "  → $item"
done
echo ""
echo -e "${YELLOW}SUMMARY OF REMAINING WORK:${NC}"
echo "  Phase 0 deletions: DONE (run cleanup-migration.sh first)"
echo "  Stale docs marked: ${#UPDATED[@]} files tagged with ⚠️ STALE headers"
echo "  Source refactoring: Listed above — tackle in Phase 1-3"
echo "  .env.example: Replace manually from CLAUDE.md Section 8"
echo ""
echo -e "${CYAN}Next: git add -A && git commit -m 'chore: mark stale docs, prep for migration'${NC}"
echo ""