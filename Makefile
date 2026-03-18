# ═══════════════════════════════════════════════════════════
# Enterprise AI Architecture — Project Improvement Engine
# ═══════════════════════════════════════════════════════════
# Usage:
#   make setup       — Generate architecture docs + scan project
#   make scan        — Run project scanner only
#   make docs        — Generate architecture reference docs only
#   make audit       — Full audit: scan + generate report
#   make clean-audit — Remove audit artifacts
# ═══════════════════════════════════════════════════════════

.PHONY: setup scan docs audit clean-audit help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

setup: docs scan ## Full setup: generate docs + scan project
	@echo ""
	@echo "✅ Setup complete!"
	@echo "→ Architecture docs: docs/architecture/"
	@echo "→ Scan report: .audit/scan-report.md"
	@echo ""
	@echo "Next: Open CLAUDE.md in Claude Code and paste:"
	@echo '  "Read CLAUDE.md. Run Phase 0. Then audit and improve."'

scan: ## Run project scanner
	@bash scripts/scan-project.sh .

docs: ## Generate architecture reference docs
	@bash scripts/generate-architecture-docs.sh .

audit: scan ## Full audit: scan + display report
	@echo ""
	@echo "═══════════════════════════════════════"
	@cat .audit/scan-report.md
	@echo "═══════════════════════════════════════"

clean-audit: ## Remove audit artifacts
	@rm -rf .audit
	@echo "✅ Audit artifacts cleaned"
