# Velox AI — Free Tier Setup

Quick setup using free cloud services for development.

## Services

| Service | Free Tier | Setup |
|---------|-----------|-------|
| PostgreSQL | [Neon](https://neon.tech) 0.5GB | Create project, enable pgvector |
| Redis | [Upstash](https://upstash.com) 10K/day | Create Redis database |
| LLM | Kimi API (paid) | Get key from [Moonshot](https://platform.moonshot.cn) |
| STT | [Deepgram](https://deepgram.com) $200 credit | Sign up, get API key |

## Quick Start

```bash
# 1. Copy template
cp .env.free-tier .env

# 2. Edit .env with your keys
nano .env

# 3. Run migrations
cd velox-api && npx prisma migrate deploy

# 4. Start
docker compose -f docker-compose.free-tier.yml up --build
```

## Required Environment Variables

```env
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379
KIMI_API_KEY=your-kimi-api-key
DEEPGRAM_API_KEY=your-deepgram-key
CLERK_ENABLED=false
```

## URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API | http://localhost:8080 |
| Agents | http://localhost:8002 |

## Troubleshooting

- **DB connection refused**: Add `?sslmode=require` to DATABASE_URL
- **Redis connection failed**: Use `rediss://` (with SSL)
- **LLM not responding**: Check KIMI_API_KEY, try `KIMI_BASE_URL=https://api.moonshot.ai/v1`
