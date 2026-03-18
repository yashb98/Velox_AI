#!/usr/bin/env bash
# =============================================================================
# Velox AI — Phase 0: Cleanup & Deletion Script
# =============================================================================
# Run this FIRST before any migration work.
# It removes all GCP/Google/stale files and trims documentation bloat.
#
# Usage:
#   chmod +x scripts/cleanup-migration.sh
#   ./scripts/cleanup-migration.sh
#
# What it does:
#   1. Deletes files that are 100% stale (GCP infra, Phi-3, Cloud Build, etc.)
#   2. Deletes generic architecture docs that aren't Velox-specific
#   3. Deletes context-heavy files (6-day build plan, old audit reports, worktrees)
#   4. Cleans up misplaced files
#   5. Reports what was deleted
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DELETED=()
SKIPPED=()

delete_if_exists() {
  local target="$1"
  local reason="$2"
  local full_path="$REPO_ROOT/$target"

  if [ -e "$full_path" ]; then
    rm -rf "$full_path"
    DELETED+=("$target — $reason")
    echo -e "  ${RED}✗ DELETED${NC}: $target"
  else
    SKIPPED+=("$target — not found")
  fi
}

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Velox AI — Phase 0: Cleanup & Deletion${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 1. GCP INFRASTRUCTURE (100% stale)
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[1/7] Removing GCP infrastructure...${NC}"
delete_if_exists "infrastructure" "GCP Terraform: Cloud SQL, Memorystore, Cloud Run, VPC, Secret Manager"
delete_if_exists "cloudbuild.yaml" "GCP Cloud Build — replaced by GitHub Actions"

# ─────────────────────────────────────────────────────────────────────────────
# 2. GOOGLE-SPECIFIC FINE-TUNING
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[2/7] Removing Google-specific fine-tuning configs...${NC}"
delete_if_exists "fine-tuning/cloud-run-job.yaml" "Cloud Run Jobs definition"
delete_if_exists "fine-tuning/cron/finetune-scheduler.yaml" "Cloud Scheduler cron"
delete_if_exists "fine-tuning/cron" "Empty cron directory"

# ─────────────────────────────────────────────────────────────────────────────
# 3. PHI-3 SLM SIDECAR (replaced by Nemotron via SGLang)
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[3/7] Removing Phi-3 SLM sidecar...${NC}"
delete_if_exists "agents/slm" "Phi-3-mini sidecar — replaced by Nemotron 3 Nano via SGLang"

# ─────────────────────────────────────────────────────────────────────────────
# 4. GENERIC ARCHITECTURE DOCS (not Velox-specific, context bloat)
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[4/7] Removing generic architecture docs (keeping Velox-relevant ones)...${NC}"

# DELETE: Generic textbook material not specific to Velox
delete_if_exists "docs/architecture/02-data-platform.md" "Generic data platform reference (98 lines)"
delete_if_exists "docs/architecture/03-feature-engineering.md" "Generic feature engineering (70 lines)"
delete_if_exists "docs/architecture/04-model-development.md" "Generic model dev (93 lines)"
delete_if_exists "docs/architecture/08-mlops-cicd.md" "Generic MLOps template (144 lines)"
delete_if_exists "docs/architecture/09-cost-architecture.md" "Generic cost reference (60 lines)"
delete_if_exists "docs/architecture/10-org-design.md" "Generic org design (38 lines)"
delete_if_exists "docs/architecture/11-reference-architectures.md" "Generic reference archs (63 lines)"
delete_if_exists "docs/architecture/README.md" "Architecture index (36 lines) — CLAUDE.md is the index now"

# DELETE: Gemini-specific compliance doc
delete_if_exists "docs/compliance/model-card-gemini.md" "Gemini model card — irrelevant after migration (131 lines)"

# ─────────────────────────────────────────────────────────────────────────────
# 5. CONTEXT-HEAVY HISTORICAL FILES
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[5/7] Removing historical/oversized context files...${NC}"
delete_if_exists "VELOX_6DAY_BUILD_PLAN.md" "Historical build plan — 1,427 lines of context waste"
delete_if_exists ".audit/scan-report.md" "Pre-improvement audit — superseded (362 lines)"
delete_if_exists ".audit/scan-report-post-improvement.md" "Post-improvement audit — historical (185 lines)"
delete_if_exists ".audit/project-scan.json" "Raw scan data — regenerable"
delete_if_exists ".audit" "Empty audit directory"

# ─────────────────────────────────────────────────────────────────────────────
# 6. WORKTREE DUPLICATES & MISPLACED FILES
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[6/7] Removing worktree duplicates and misplaced files...${NC}"
delete_if_exists ".claude/worktrees" "Worktree duplicates — copies of README, build plan, Dockerfiles (~2,200 lines)"
delete_if_exists ".claire" "Stale .claire worktrees directory"
delete_if_exists "velox-api/src/Yash_Bishnoi_Resume.pdf" "Personal resume in source code"
delete_if_exists "analyse-project.sh" "One-time analysis script — not needed in repo"
delete_if_exists "ANALYSIS_REPORT.md" "One-time analysis report — not needed in repo"

# ─────────────────────────────────────────────────────────────────────────────
# 7. CLEANUP REPORT
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  CLEANUP COMPLETE${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}Deleted ${#DELETED[@]} items:${NC}"
for item in "${DELETED[@]}"; do
  echo "  ✗ $item"
done

if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo ""
  echo -e "${YELLOW}Skipped ${#SKIPPED[@]} items (already gone):${NC}"
  for item in "${SKIPPED[@]}"; do
    echo "  ○ $item"
  done
fi

# Estimate lines saved
echo ""
echo -e "${CYAN}Estimated context saved: ~12,000+ lines of stale documentation${NC}"
echo ""
echo -e "${YELLOW}NEXT STEPS:${NC}"
echo "  1. Copy the new CLAUDE.md into your repo root (replaces v4)"
echo "  2. Copy .claude/skills/ and .claude/commands/ into your repo"
echo "  3. Run: git add -A && git commit -m 'chore: phase 0 cleanup — remove GCP, stale docs, context bloat'"
echo "  4. Proceed to Phase 1 (Voice/Pipecat)"
echo ""