---
title: README

---

# FitSync - Fitness Tracker App

> A Hevy-inspired fitness tracking application built with **MongoDB + Redis**, developed as a final group project for ENCE614016 — Database System and Laboratory.

---

## Group NAMO

| Name | Student ID | Role |
|------|------------|------|
| Nadira Fayyaza Aisy | 2406368933 | Backend & MongoDB Lead |
| Naufal Rafif Adigama | 2406368965 | Redis & Benchmarking Lead |
| Syifa Sarah Nuraini | 2406368883 | Frontend & Documentation Lead |

**Course:** ENCE614016 - Database System and Laboratory  
**Deadline:** 15 May 2026

---

## Project Overview

FitSync is a fitness tracker app inspired by [Hevy](https://hevy.com). Users can log workouts, track exercise history, view weekly stats, and compete on a streak-based leaderboard.
All powered by a dual-database backend.

### Why Two Databases?

| Database | Role in FitSync | Why |
|----------|----------------|-----|
| **MongoDB** | Persistent storage users, workouts, exercises | Document model fits nested workout/exercise data naturally |
| **Redis** | Real-time leaderboard, session tokens, API cache | Sub-millisecond reads for live rankings; TTL for sessions |

These are **not redundant** — MongoDB is the source of truth, Redis handles everything time-sensitive and high-frequency.

---

## Architecture

![03295ae5-cc48-4fbc-8020-7668f5c569d8](https://hackmd.io/_uploads/H1VEVBuRZx.jpg)


### Data Flow

![5bff5d8b-9fc0-4c90-832a-afe92362d511](https://hackmd.io/_uploads/rJ9vNB_CZx.jpg)


---

## Project Structure

```
fitsync/
├── docker-compose.yml          # Spins up API + MongoDB + Redis
├── Dockerfile
├── package.json
├── README.md
├── src/
│   ├── index.js                # Express entry point
│   ├── models/
│   │   ├── User.js             # MongoDB user schema
│   │   └── Workout.js          # MongoDB workout schema (nested exercises)
│   ├── routes/
│   │   ├── auth.js             # Register, Login → Redis SETEX session
│   │   ├── workouts.js         # Log workout → MongoDB + Redis ZADD
│   │   ├── leaderboard.js      # Read top 10 from Redis ZRANGE
│   │   └── stats.js            # Weekly stats (cache-aside pattern)
│   └── middleware/
│       └── auth.js             # JWT + Redis session validation
├── scripts/
│   └── seed.js                 # Populates MongoDB + Redis with sample data
├── benchmarks/
│   ├── benchmark.js            # Latency comparison: Redis cache vs MongoDB
│   ├── results.csv             # Raw benchmark output
│   └── benchmark_plot.png      # Bar chart of results
└── docs/
    ├── data_models.md          # MongoDB schemas + Redis key design
    ├── architecture.png        # Architecture diagram
    └── design_decisions.md     # Why we chose each DB for each role
```

---

## Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop) installed and running

### 1. Clone the repository
```bash
git clone https://github.com/<your-username>/fitsync-namo.git
cd fitsync-namo
```

### 2. Start all services
```bash
docker compose up --build
```
This starts three containers: `fitsync_api` (port 3000), `fitsync_mongo` (port 27017), `fitsync_redis` (port 6379).

### 3. Seed sample data
```bash
docker exec fitsync_api node scripts/seed.js
```
This creates 3 users (nadira, naufal, syifa), 15 workouts, and seeds the Redis leaderboard.

### 4. Test the API
```
GET  http://localhost:3000/
GET  http://localhost:3000/api/leaderboard
POST http://localhost:3000/api/auth/login
POST http://localhost:3000/api/workouts
GET  http://localhost:3000/api/stats/weekly/:userId
```

---

## API Reference

### Auth

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | `{ username, email, password, profile }` | Register new user → saved to MongoDB |
| POST | `/api/auth/login` | `{ email, password }` | Login → session token stored in Redis SETEX |

### Workouts

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/workouts` | ✅ | Log workout → MongoDB + updates Redis leaderboard |
| GET | `/api/workouts` | ✅ | Get all workouts for current user from MongoDB |

### Leaderboard & Stats

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/leaderboard` | ❌ | Top 10 streak rankings → read directly from Redis |
| GET | `/api/stats/weekly/:userId` | ✅ | Weekly stats → Redis cache first, MongoDB on miss |

---

## Data Models

### MongoDB — `users` collection
```json
{
  "_id": "ObjectId",
  "username": "nadira",
  "email": "nadira@fitsync.com",
  "password_hash": "...",
  "created_at": "2026-04-26T00:00:00Z",
  "profile": {
    "age": 21,
    "weight_kg": 55,
    "height_cm": 162
  }
}
```

### MongoDB — `workouts` collection
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId",
  "date": "2026-05-05T10:00:00Z",
  "duration_min": 45,
  "calories_burned": 320,
  "exercises": [
    { "name": "Squats", "sets": 4, "reps": 12, "weight_kg": 40 },
    { "name": "Deadlift", "sets": 3, "reps": 8, "weight_kg": 80 }
  ]
}
```

### Redis Key Design

![1e9d7ab1-0d81-41a1-8711-681c5eedac6d](https://hackmd.io/_uploads/rktuEHdRZx.jpg)


| Key Pattern | Type | Command | TTL |
|-------------|------|---------|-----|
| `leaderboard` | Sorted Set | `ZADD leaderboard <streak> <userId>` | No expiry |
| `session:<token>` | String | `SETEX` | 3600s (1 hr) |
| `cache:weekly:<userId>` | String/JSON | `SETEX` | 300s (5 min) |

---

## Benchmarks

Benchmarks compare **Redis cache read** vs **MongoDB aggregation query** for the weekly stats endpoint.

Results saved in `/benchmarks/results.csv`. See `/benchmarks/benchmark_plot.png` for the chart.

To run benchmarks yourself:
```bash
docker exec fitsync_api node benchmarks/benchmark.js
```

---

## AI Usage Disclosure

This project used **Claude (Anthropic)** to assist with:
- Initial project scaffolding (Express routes, MongoDB schemas, Redis integration patterns)
- docker-compose configuration
- README structure

All generated code was reviewed, tested, and understood by all group members. Every member is able to explain any part of the codebase during Q&A, as required by the academic integrity policy.

---

## License

MIT — for academic use only.
