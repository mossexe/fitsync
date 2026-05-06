"""
benchmark.py — FitSync Latency Benchmark (Group NAMO)
======================================================
Compares MongoDB vs Redis across all FitSync access patterns:

  1. Weekly Stats   — MongoDB aggregation  vs  Redis cache GET
  2. Leaderboard    — MongoDB find+sort    vs  Redis ZRANGE
  3. Session Auth   — MongoDB findOne      vs  Redis session GET
  4. Workout Write  — MongoDB insertOne + Redis ZINCRBY + DEL (combined write)

Run AFTER seeding:
    python benchmarks/benchmark.py

Outputs:
    benchmarks/results.csv          — raw per-iteration latencies
    benchmarks/summary.csv          — stats table (avg / p50 / p95 / p99 / std)
    benchmarks/plot_latency.png     — per-iteration line chart
    benchmarks/plot_comparison.png  — avg bar chart with error bars
    benchmarks/plot_distribution.png— histogram / KDE of all operations

Requirements:
    pip install pymongo redis matplotlib numpy scipy
"""

import csv
import json
import os
import statistics
import time
from datetime import datetime, timedelta

import matplotlib
matplotlib.use("Agg")  # non-interactive backend — safe inside Docker
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import numpy as np

from bson import ObjectId
from pymongo import MongoClient
from redis import Redis

# ─── Config ───────────────────────────────────────────────────────────────────
MONGO_URI  = os.getenv("MONGO_URI",  "mongodb://localhost:27017/fitsync")
REDIS_URL  = os.getenv("REDIS_URL",  "redis://localhost:6379")
ITERATIONS = int(os.getenv("BENCH_ITERATIONS", "100"))
WARMUP     = int(os.getenv("BENCH_WARMUP",     "10"))
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "benchmarks")

# ─── Connections ──────────────────────────────────────────────────────────────
print("🔌  Connecting to databases...")
try:
    mongo = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    mongo.admin.command("ping")
    print(f"    ✅  MongoDB  → {MONGO_URI}")
except Exception as e:
    raise SystemExit(f"❌  MongoDB connection failed: {e}")

try:
    r = Redis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=5)
    r.ping()
    print(f"    ✅  Redis    → {REDIS_URL}\n")
except Exception as e:
    raise SystemExit(f"❌  Redis connection failed: {e}")

db = mongo["fitsync"]

# ─── Helpers ──────────────────────────────────────────────────────────────────
def percentile(data, p):
    """Return the p-th percentile of a sorted list."""
    sorted_data = sorted(data)
    idx = max(0, int(len(sorted_data) * p / 100) - 1)
    return sorted_data[idx]

def stats_of(times):
    """Return a dict of summary statistics for a list of ms timings."""
    return {
        "avg":  statistics.mean(times),
        "min":  min(times),
        "p50":  percentile(times, 50),
        "p95":  percentile(times, 95),
        "p99":  percentile(times, 99),
        "max":  max(times),
        "std":  statistics.stdev(times) if len(times) > 1 else 0.0,
    }

def measure_ms(fn):
    """Run fn once and return elapsed milliseconds."""
    t0 = time.perf_counter()
    fn()
    return (time.perf_counter() - t0) * 1000

# ─── Setup ────────────────────────────────────────────────────────────────────
def get_first_user():
    user = db.users.find_one({})
    if not user:
        raise SystemExit("❌  No users found. Run: node scripts/seed.js first.")
    return user

# ─── Benchmark Functions ──────────────────────────────────────────────────────

# 1. WEEKLY STATS ── MongoDB aggregation
def bench_mongo_weekly(user_id_obj):
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    list(db.workouts.aggregate([
        {"$match": {"user_id": user_id_obj, "date": {"$gte": seven_days_ago}}},
        {"$group": {
            "_id":            None,
            "total_workouts": {"$sum": 1},
            "total_duration": {"$sum": "$duration_min"},
            "total_calories": {"$sum": "$calories_burned"},
            "avg_duration":   {"$avg": "$duration_min"},
        }}
    ]))

# 1. WEEKLY STATS ── Redis cache GET (pure cache hit — no SET during test)
def bench_redis_weekly(user_id_str):
    raw = r.get(f"cache:weekly:{user_id_str}")
    if raw:
        json.loads(raw)

def seed_redis_weekly_cache(user_id_str, user_id_obj):
    """Pre-populate Redis cache so every GET during the test is a real hit."""
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    result = list(db.workouts.aggregate([
        {"$match": {"user_id": user_id_obj, "date": {"$gte": seven_days_ago}}},
        {"$group": {
            "_id":            None,
            "total_workouts": {"$sum": 1},
            "total_duration": {"$sum": "$duration_min"},
            "total_calories": {"$sum": "$calories_burned"},
            "avg_duration":   {"$avg": "$duration_min"},
        }}
    ]))
    data = result[0] if result else {"total_workouts": 0}
    # Remove non-serialisable _id field
    data.pop("_id", None)
    r.setex(f"cache:weekly:{user_id_str}", 300, json.dumps(data))

# 2. LEADERBOARD ── MongoDB find + sort (simulate cold read)
def bench_mongo_leaderboard():
    """Simulates what the leaderboard would look like WITHOUT Redis."""
    list(db.workouts.aggregate([
        {"$group": {"_id": "$user_id", "workout_count": {"$sum": 1}}},
        {"$sort":  {"workout_count": -1}},
        {"$limit": 10},
        {"$lookup": {
            "from":         "users",
            "localField":   "_id",
            "foreignField": "_id",
            "as":           "user_info",
        }},
        {"$project": {
            "username": {"$arrayElemAt": ["$user_info.username", 0]},
            "workout_count": 1,
        }},
    ]))

# 2. LEADERBOARD ── Redis ZRANGE (actual production path)
def bench_redis_leaderboard():
    entries = r.zrange("leaderboard:streak", 0, 9, withscores=True, rev=True)
    # Enrich with usernames (same as production — small MongoDB lookup)
    if entries:
        user_ids = [e[0] for e in entries]
        list(db.users.find(
            {"_id": {"$in": [ObjectId(uid) for uid in user_ids if len(uid) == 24]}},
            {"username": 1}
        ))

# 3. SESSION AUTH ── MongoDB findOne (full credential check)
def bench_mongo_session():
    db.users.find_one({"email": "nadira@fitsync.com"}, {"password_hash": 1, "username": 1})

# 3. SESSION AUTH ── Redis session GET (already-logged-in token lookup)
DUMMY_TOKEN = "bench_token_fitsync_namo_2026"
def seed_redis_session(user_id_str):
    payload = {"userId": user_id_str, "username": "nadira"}
    r.setex(f"session:{DUMMY_TOKEN}", 3600, json.dumps(payload))

def bench_redis_session():
    raw = r.get(f"session:{DUMMY_TOKEN}")
    if raw:
        json.loads(raw)

# 4. WORKOUT WRITE ── MongoDB insert + Redis ZINCRBY + DEL (combined)
#    This is a single operation in production — we benchmark it as a unit.
def bench_write_workout(user_id_str, user_id_obj):
    # Write to MongoDB
    result = db.workouts.insert_one({
        "user_id":        user_id_obj,
        "date":           datetime.utcnow(),
        "duration_min":   30,
        "calories_burned": 200,
        "exercises":      [{"name": "Benchmark", "sets": 1, "reps": 1, "weight_kg": 0}],
    })
    # Update Redis leaderboard
    r.zincrby("leaderboard:streak", 1, user_id_str)
    # Invalidate cache
    r.delete(f"cache:weekly:{user_id_str}")
    # Clean up test document (keep DB clean)
    db.workouts.delete_one({"_id": result.inserted_id})
    # Restore cache and leaderboard score
    r.zincrby("leaderboard:streak", -1, user_id_str)

# ─── Run All Benchmarks ───────────────────────────────────────────────────────
def run_all():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    user      = get_first_user()
    user_id_s = str(user["_id"])
    user_id_o = user["_id"]

    print(f"👤  Benchmarking with user: {user['username']} ({user_id_s})")
    print(f"🔁  Iterations : {ITERATIONS}  |  Warmup : {WARMUP}\n")

    # ── Pre-populate Redis caches ──────────────────────────────────────────
    print("🌱  Seeding Redis caches for deterministic hits...")
    seed_redis_weekly_cache(user_id_s, user_id_o)
    seed_redis_session(user_id_s)
    print("    ✅  Done\n")

    benchmarks = {
        "MongoDB — Weekly Stats":    lambda: bench_mongo_weekly(user_id_o),
        "Redis   — Weekly Stats":    lambda: bench_redis_weekly(user_id_s),
        "MongoDB — Leaderboard":     lambda: bench_mongo_leaderboard(),
        "Redis   — Leaderboard":     lambda: bench_redis_leaderboard(),
        "MongoDB — Session Auth":    lambda: bench_mongo_session(),
        "Redis   — Session Auth":    lambda: bench_redis_session(),
        "Write   — Workout (Full)":  lambda: bench_write_workout(user_id_s, user_id_o),
    }

    results = {}  # name → list of ms

    for name, fn in benchmarks.items():
        # Warmup
        for _ in range(WARMUP):
            fn()

        times = []
        for i in range(ITERATIONS):
            times.append(measure_ms(fn))

        results[name] = times
        s = stats_of(times)
        print(f"  {name:<35}  avg={s['avg']:6.3f}ms  p95={s['p95']:6.3f}ms  p99={s['p99']:6.3f}ms")

    print()

    # ── Save results.csv ──────────────────────────────────────────────────
    csv_path = os.path.join(OUTPUT_DIR, "results.csv")
    with open(csv_path, "w", newline="") as f:
        w = csv.writer(f)
        names = list(results.keys())
        w.writerow(["iteration"] + names)
        for i in range(ITERATIONS):
            w.writerow([i + 1] + [round(results[n][i], 4) for n in names])
    print(f"📄  Saved {csv_path}")

    # ── Save summary.csv ──────────────────────────────────────────────────
    summary_path = os.path.join(OUTPUT_DIR, "summary.csv")
    with open(summary_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["benchmark", "avg_ms", "min_ms", "p50_ms", "p95_ms", "p99_ms", "max_ms", "std_ms"])
        for name, times in results.items():
            s = stats_of(times)
            w.writerow([
                name,
                round(s["avg"], 4), round(s["min"], 4),
                round(s["p50"], 4), round(s["p95"], 4),
                round(s["p99"], 4), round(s["max"], 4),
                round(s["std"], 4),
            ])
    print(f"📄  Saved {summary_path}")

    # ── Plots ─────────────────────────────────────────────────────────────
    _plot_latency_lines(results)
    _plot_comparison_bars(results)
    _plot_distribution(results)

    # ── Console summary table ──────────────────────────────────────────────
    print("\n" + "=" * 74)
    print(f"{'Benchmark':<35} {'avg':>7} {'p50':>7} {'p95':>7} {'p99':>7} {'std':>7}")
    print("-" * 74)
    for name, times in results.items():
        s = stats_of(times)
        print(f"  {name:<33} {s['avg']:>6.3f}  {s['p50']:>6.3f}  {s['p95']:>6.3f}  {s['p99']:>6.3f}  {s['std']:>6.3f}")
    print("=" * 74)
    print("  All values in milliseconds\n")

    return results

# ─── Plot 1 — Per-Iteration Line Chart ───────────────────────────────────────
def _plot_latency_lines(results):
    COLORS = {
        "MongoDB": "#4e9af1",
        "Redis":   "#f47c3c",
        "Write":   "#9b59b6",
    }
    fig, axes = plt.subplots(3, 1, figsize=(12, 11), sharex=True)
    groups = [
        ("Weekly Stats",  ["MongoDB — Weekly Stats",   "Redis   — Weekly Stats"]),
        ("Leaderboard",   ["MongoDB — Leaderboard",    "Redis   — Leaderboard"]),
        ("Session Auth",  ["MongoDB — Session Auth",   "Redis   — Session Auth"]),
    ]

    for ax, (title, names) in zip(axes, groups):
        for name in names:
            times = results[name]
            label_key = "MongoDB" if "MongoDB" in name else "Redis"
            color = COLORS[label_key]
            avg   = statistics.mean(times)
            ax.plot(range(1, len(times) + 1), times,
                    label=f"{name.strip()} (avg {avg:.2f}ms)",
                    color=color, linewidth=1.2, alpha=0.85)
            ax.axhline(avg, color=color, linestyle="--", linewidth=0.8, alpha=0.5)
        ax.set_title(title, fontsize=11, fontweight="bold")
        ax.set_ylabel("Latency (ms)")
        ax.legend(fontsize=8)
        ax.grid(True, alpha=0.3)

    # Write (standalone)
    write_times = results["Write   — Workout (Full)"]
    write_avg   = statistics.mean(write_times)
    axes[-1].plot(range(1, len(write_times) + 1), write_times,
                  label=f"Write — Workout (avg {write_avg:.2f}ms)",
                  color=COLORS["Write"], linewidth=1.2, alpha=0.85)
    axes[-1].axhline(write_avg, color=COLORS["Write"], linestyle="--", linewidth=0.8, alpha=0.5)
    axes[-1].set_title("Workout Write (MongoDB + Redis combined)", fontsize=11, fontweight="bold")
    axes[-1].set_ylabel("Latency (ms)")
    axes[-1].set_xlabel("Iteration")
    axes[-1].legend(fontsize=8)
    axes[-1].grid(True, alpha=0.3)

    fig.suptitle("FitSync — Per-Iteration Latency\n(MongoDB vs Redis, all endpoints)",
                 fontsize=13, fontweight="bold", y=1.01)
    plt.tight_layout()
    path = os.path.join(OUTPUT_DIR, "plot_latency.png")
    plt.savefig(path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"📊  Saved {path}")

# ─── Plot 2 — Avg Bar Chart with Error Bars ───────────────────────────────────
def _plot_comparison_bars(results):
    labels = [n.strip() for n in results.keys()]
    avgs   = [statistics.mean(t) for t in results.values()]
    stds   = [statistics.stdev(t) if len(t) > 1 else 0 for t in results.values()]
    p95s   = [percentile(t, 95) for t in results.values()]

    colors = []
    for name in results.keys():
        if "MongoDB" in name:
            colors.append("#4e9af1")
        elif "Redis" in name:
            colors.append("#f47c3c")
        else:
            colors.append("#9b59b6")

    x = np.arange(len(labels))
    width = 0.35

    fig, ax = plt.subplots(figsize=(13, 6))
    bars_avg = ax.bar(x - width / 2, avgs, width, label="Average (ms)",
                      color=colors, alpha=0.85, yerr=stds, capsize=4, error_kw={"elinewidth": 1.2})
    bars_p95 = ax.bar(x + width / 2, p95s, width, label="P95 (ms)",
                      color=colors, alpha=0.45, hatch="//")

    ax.set_xticks(x)
    ax.set_xticklabels(labels, rotation=20, ha="right", fontsize=9)
    ax.set_ylabel("Latency (ms)")
    ax.set_title("FitSync — Average & P95 Latency Comparison\n(error bars = ±1 std dev)",
                 fontsize=12, fontweight="bold")
    ax.legend(fontsize=9)
    ax.grid(axis="y", alpha=0.3)

    # Value labels on bars
    for bar in bars_avg:
        h = bar.get_height()
        ax.annotate(f"{h:.2f}", xy=(bar.get_x() + bar.get_width() / 2, h),
                    xytext=(0, 3), textcoords="offset points",
                    ha="center", va="bottom", fontsize=7)

    # Legend patch for colors
    from matplotlib.patches import Patch
    legend_elements = [
        Patch(facecolor="#4e9af1", label="MongoDB"),
        Patch(facecolor="#f47c3c", label="Redis"),
        Patch(facecolor="#9b59b6", label="Write (combined)"),
    ]
    ax.legend(handles=legend_elements, loc="upper right", fontsize=9)

    plt.tight_layout()
    path = os.path.join(OUTPUT_DIR, "plot_comparison.png")
    plt.savefig(path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"📊  Saved {path}")

# ─── Plot 3 — Distribution / Histogram ───────────────────────────────────────
def _plot_distribution(results):
    group_pairs = [
        ("Weekly Stats",  "MongoDB — Weekly Stats",  "Redis   — Weekly Stats"),
        ("Leaderboard",   "MongoDB — Leaderboard",   "Redis   — Leaderboard"),
        ("Session Auth",  "MongoDB — Session Auth",  "Redis   — Session Auth"),
    ]

    fig, axes = plt.subplots(1, 3, figsize=(15, 5))

    for ax, (title, mongo_key, redis_key) in zip(axes, group_pairs):
        m_times = results[mongo_key]
        r_times = results[redis_key]

        ax.hist(m_times, bins=20, color="#4e9af1", alpha=0.7,
                label=f"MongoDB (avg {statistics.mean(m_times):.2f}ms)")
        ax.hist(r_times, bins=20, color="#f47c3c", alpha=0.7,
                label=f"Redis   (avg {statistics.mean(r_times):.2f}ms)")

        ax.axvline(statistics.mean(m_times), color="#4e9af1",
                   linestyle="--", linewidth=1.5, label="MongoDB avg")
        ax.axvline(statistics.mean(r_times), color="#f47c3c",
                   linestyle="--", linewidth=1.5, label="Redis avg")

        ax.set_title(title, fontsize=11, fontweight="bold")
        ax.set_xlabel("Latency (ms)")
        ax.set_ylabel("Frequency")
        ax.legend(fontsize=7.5)
        ax.grid(True, alpha=0.3)

    fig.suptitle("FitSync — Latency Distribution (Histogram)\nMongoDB vs Redis per endpoint",
                 fontsize=12, fontweight="bold")
    plt.tight_layout()
    path = os.path.join(OUTPUT_DIR, "plot_distribution.png")
    plt.savefig(path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"📊  Saved {path}")

# ─── Entry Point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  FitSync Benchmark — Group NAMO")
    print(f"  {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print("=" * 60 + "\n")
    run_all()
    print("✅  Benchmark complete.\n")
    print("   Output files:")
    for f in ["results.csv", "summary.csv", "plot_latency.png",
              "plot_comparison.png", "plot_distribution.png"]:
        print(f"     benchmarks/{f}")
    print()
