# Tech stack

## Frontend
- React Native (Expo)
- TypeScript 5.x strict
- Zustand для state, TanStack Query для server-state

## Backend
- Node 22 + Fastify
- PostgreSQL 16 (через Prisma)
- Redis для streak counters

## Infra
- Single VPS на старте, переход на Fly.io после 1k DAU
- GitHub Actions CI

## Запреты
- Firebase (vendor lock-in)
- Микросервисы на старте (один монолит до 5k DAU)
