# Tech stack

## Frontend
- React Native (Expo)
- TypeScript 5.x strict
- Zustand for state, TanStack Query for server-state

## Backend
- Node 22 + Fastify
- PostgreSQL 16 (via Prisma)
- Redis for streak counters

## Infra
- Single VPS at the start, move to Fly.io after 1k DAU
- GitHub Actions CI

## Forbidden
- Firebase (vendor lock-in)
- Microservices at the start (one monolith up to 5k DAU)
