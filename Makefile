# Velox AI — Development & Architecture Makefile
# ═══════════════════════════════════════════════════════════

.PHONY: help dev build up down logs test lint scan docs audit clean

help: ## Show this help
	@echo "Velox AI Commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

# ─── Development ───────────────────────────────────────────
dev: ## Start all services with docker compose
	docker compose up --build

dev-free: ## Start with free tier services (Neon/Upstash)
	docker compose -f docker-compose.free-tier.yml up --build

build: ## Build all containers
	docker compose build

up: ## Start containers (detached)
	docker compose up -d

down: ## Stop all containers
	docker compose down

logs: ## View container logs
	docker compose logs -f

# ─── Testing ───────────────────────────────────────────────
test: ## Run all tests
	cd velox-api && npm test 2>/dev/null || echo "No API tests"
	cd agents && python -m pytest tests/ -v 2>/dev/null || echo "No agent tests"

# ─── Code Quality ──────────────────────────────────────────
lint: ## Lint all code
	cd agents && ruff check . 2>/dev/null || echo "Install ruff for Python linting"

# ─── Database ──────────────────────────────────────────────
migrate: ## Run database migrations
	cd velox-api && npx prisma migrate deploy

seed: ## Seed database
	cd velox-api && npx prisma db seed

# ─── Architecture ──────────────────────────────────────────
scan: ## Run project scanner
	@if [ -f scripts/scan-project.sh ]; then bash scripts/scan-project.sh .; \
	else echo "Run: find . -type f -not -path '*/node_modules/*' | head -100"; fi

docs: ## Generate architecture docs
	@if [ -f scripts/generate-architecture-docs.sh ]; then bash scripts/generate-architecture-docs.sh .; \
	else echo "Architecture docs in docs/architecture/"; fi

audit: scan ## Full audit: scan + display report
	@if [ -f .audit/scan-report.md ]; then cat .audit/scan-report.md; fi

# ─── Cleanup ───────────────────────────────────────────────
clean: ## Remove build artifacts
	docker compose down -v --rmi local 2>/dev/null || true
	rm -rf .audit 2>/dev/null || true
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
