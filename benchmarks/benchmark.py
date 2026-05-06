"""
benchmark.py — compares latency of:
  (A) Direct MongoDB aggregation
  (B) Redis cache hit

Run after seeding: python benchmarks/benchmark.py
Outputs: benchmarks/results.csv + benchmarks/benchmark_plot.png
"""

import time, csv, statistics, json, os
import matplotlib.pyplot as plt
from pymongo import MongoClient
from redis import Redis
from bson import ObjectId
from datetime import datetime, timedelta

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/fitsync")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
ITERATIONS = 50

mongo = MongoClient(MONGO_URI)
db    = mongo["fitsync"]
r     = Redis.from_url(REDIS_URL, decode_responses=True)

def get_user_id():
    user = db.users.find_one({})
    return str(user["_id"])

def mongo_weekly_query(user_id):
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    result = list(db.workouts.aggregate([
        {"$match": {"user_id": ObjectId(user_id), "date": {"$gte": seven_days_ago}}},
        {"$group": {
            "_id": None,
            "total_workouts": {"$sum": 1},
            "total_calories": {"$sum": "$calories_burned"},
            "total_duration": {"$sum": "$duration_min"}
        }}
    ]))
    return result[0] if result else {}

def redis_cache_hit(user_id, data):
    r.setex(f"cache:weekly:{user_id}", 300, json.dumps(data))
    raw = r.get(f"cache:weekly:{user_id}")
    return json.loads(raw)

def run_benchmark():
    user_id = get_user_id()
    print(f"Benchmarking with user: {user_id}")

    # Warm up MongoDB
    mongo_weekly_query(user_id)
    # Pre-populate Redis cache
    warm = mongo_weekly_query(user_id)
    redis_cache_hit(user_id, warm)

    mongo_times, redis_times = [], []

    for i in range(ITERATIONS):
        t0 = time.perf_counter()
        mongo_weekly_query(user_id)
        mongo_times.append((time.perf_counter() - t0) * 1000)

        t1 = time.perf_counter()
        redis_cache_hit(user_id, warm)
        redis_times.append((time.perf_counter() - t1) * 1000)

    print(f"\nMongoDB  — avg: {statistics.mean(mongo_times):.2f}ms  p95: {sorted(mongo_times)[int(ITERATIONS*0.95)]:.2f}ms")
    print(f"Redis    — avg: {statistics.mean(redis_times):.2f}ms  p95: {sorted(redis_times)[int(ITERATIONS*0.95)]:.2f}ms")

    # Save CSV
    os.makedirs("benchmarks", exist_ok=True)
    with open("benchmarks/results.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["iteration", "mongodb_ms", "redis_ms"])
        for i, (m, rd) in enumerate(zip(mongo_times, redis_times), 1):
            w.writerow([i, round(m, 3), round(rd, 3)])
    print("Saved benchmarks/results.csv")

    # Plot
    plt.figure(figsize=(10, 5))
    plt.plot(mongo_times, label="MongoDB (direct)", color="#4e9af1", linewidth=1.5)
    plt.plot(redis_times, label="Redis (cache hit)", color="#f47c3c", linewidth=1.5)
    plt.axhline(statistics.mean(mongo_times), color="#4e9af1", linestyle="--", alpha=0.5)
    plt.axhline(statistics.mean(redis_times), color="#f47c3c", linestyle="--", alpha=0.5)
    plt.xlabel("Iteration")
    plt.ylabel("Latency (ms)")
    plt.title("FitSync — MongoDB vs Redis Cache Latency (Weekly Stats)")
    plt.legend()
    plt.tight_layout()
    plt.savefig("benchmarks/benchmark_plot.png", dpi=150)
    print("Saved benchmarks/benchmark_plot.png")

if __name__ == "__main__":
    run_benchmark()
