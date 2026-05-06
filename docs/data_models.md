# FitSync — Data Models & Design Decisions

## MongoDB Collections

### `users`
```json
{
  "_id": "ObjectId",
  "username": "String (unique)",
  "email": "String (unique)",
  "password_hash": "String (bcrypt)",
  "created_at": "Date",
  "profile": {
    "age": "Number",
    "weight_kg": "Number",
    "height_cm": "Number"
  }
}
```

### `workouts`
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId (ref: users)",
  "date": "Date",
  "duration_min": "Number",
  "calories_burned": "Number",
  "exercises": [
    {
      "name": "String",
      "sets": "Number",
      "reps": "Number",
      "weight_kg": "Number"
    }
  ]
}
```

**Index:** `{ user_id: 1, date: -1 }` — speeds up per-user chronological queries.

---

## Redis Keys

| Key Pattern | Type | TTL | Purpose |
|-------------|------|-----|---------|
| `leaderboard:streak` | Sorted Set | None | Global streak rankings (score = streak days) |
| `session:<token>` | String | 3600s | JWT session cache |
| `cache:weekly:<userId>` | String (JSON) | 300s | Weekly stats cache |

---

## Design Decisions

### Why document model for workouts?
A workout naturally nests its exercises — storing them as an embedded array avoids joins and keeps the entire workout as one atomic document.

### Why Redis Sorted Set for leaderboard?
`ZADD` + `ZRANGE REV WITHSCORES` gives O(log N) insert and O(log N + K) retrieval for top-K, which is dramatically faster than a MongoDB sort on all users at read time.

### Consistency strategy
Write-through caching: MongoDB is always written first (source of truth). Redis cache keys are invalidated on any relevant write, so stale data is never served beyond the TTL window.
