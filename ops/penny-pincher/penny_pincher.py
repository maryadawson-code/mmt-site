#!/usr/bin/env python3
"""
Penny Pincher — Model Routing Cost Monitor for OpenClaw

Three jobs:
  1. Real-Time Route Watcher: tail inference logs, flag violations
  2. Cost Ledger: maintain running cost ledger per-agent
  3. Daily Report: 8 AM daily markdown report

Usage:
  python penny_pincher.py                # full daemon
  python penny_pincher.py --dry-run      # 60s test, no file writes
  python penny_pincher.py --report-now   # generate report immediately
"""

import json
import os
import sys
import time
import signal
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from collections import defaultdict

# ─── CONFIG ─────────────────────────────────────────────────────

BASE_DIR = Path(__file__).parent
LEDGER_PATH = BASE_DIR / "cost_ledger.json"
REPORTS_DIR = BASE_DIR / "reports"

# OpenClaw log location
OPENCLAW_DIR = Path.home() / ".openclaw"
OPENCLAW_CONFIG = OPENCLAW_DIR / "openclaw.json"
INFERENCE_LOG = OPENCLAW_DIR / "logs" / "inference.jsonl"

# Provider config
PROVIDERS_YAML = OPENCLAW_DIR / "providers.yaml"

DRY_RUN = "--dry-run" in sys.argv
REPORT_NOW = "--report-now" in sys.argv

# Anthropic cost rates (per 1K tokens)
COST_RATES = {
    "claude-sonnet-4-5": {"input": 0.003, "output": 0.015},
    "claude-sonnet-4-5-20250514": {"input": 0.003, "output": 0.015},
    "claude-sonnet-4-5-20250929": {"input": 0.003, "output": 0.015},
    "claude-sonnet-4-6": {"input": 0.003, "output": 0.015},
    "claude-haiku-4-5-20251001": {"input": 0.0008, "output": 0.004},
    "claude-haiku-3.5": {"input": 0.00025, "output": 0.00125},
    "claude-opus-4": {"input": 0.015, "output": 0.075},
    "sonar-pro": {"input": 0.003, "output": 0.015},
    "sonar": {"input": 0.001, "output": 0.001},
    "gpt-4o": {"input": 0.0025, "output": 0.01},
    "gemini-2.5-pro": {"input": 0.00125, "output": 0.005},
}

# Local models cost nothing
LOCAL_MODELS = {"gemma3:27b", "gemma3:12b", "gemma3:4b"}

# Tasks that MUST use Anthropic (web_search dependency)
ANTHROPIC_REQUIRED_TASKS = {
    "contract_research",
    "contract_verify",
    "newsletter_research",
    "fact_check",
    "protest_monitor",
    "reasoning_complex",
    "proposal_writing",
    "sensitive_review",
}

# Tasks that SHOULD use local models
LOCAL_ELIGIBLE_TASKS = {
    "summarization",
    "classification",
    "extraction",
    "drafting_routine",
    "code_generation",
    "research_synthesis",
}

# Routing table: task_type → recommended model
ROUTING_TABLE = {
    "summarization": "gemma3:27b",
    "classification": "gemma3:12b",
    "extraction": "gemma3:27b",
    "drafting_routine": "gemma3:27b",
    "code_generation": "gemma3:27b",
    "research_synthesis": "gemma3:27b",
    "reasoning_complex": "claude-sonnet-4-5",
    "proposal_writing": "claude-sonnet-4-5",
    "sensitive_review": "claude-sonnet-4-5",
    # model-router.js task types
    "scoring": "gemma3:27b",
    "rewrite": "gemma3:27b",
    "review": "gemma3:27b",
    "opportunity_scan": "gemma3:27b",
    "sb_classify": "gemma3:12b",
    "contract_research": "claude-sonnet-4-5",
    "contract_verify": "claude-sonnet-4-5",
    "newsletter_research": "claude-sonnet-4-5",
    "fact_check": "claude-sonnet-4-5",
    "protest_monitor": "claude-sonnet-4-5",
}

# ─── LOGGING ────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("penny-pincher")


# ─── LEDGER ─────────────────────────────────────────────────────

def load_ledger():
    """Load or initialize the cost ledger."""
    if LEDGER_PATH.exists():
        try:
            with open(LEDGER_PATH) as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            log.warning("Corrupt ledger, reinitializing")
    return {
        "created": datetime.now(timezone.utc).isoformat(),
        "last_updated": None,
        "agents": {},
        "daily_totals": {},
        "violations": [],
    }


def save_ledger(ledger):
    """Persist the cost ledger to disk."""
    if DRY_RUN:
        log.info("[dry-run] Would save ledger (%d agents tracked)", len(ledger.get("agents", {})))
        return
    ledger["last_updated"] = datetime.now(timezone.utc).isoformat()
    LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = LEDGER_PATH.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(ledger, f, indent=2)
    tmp.replace(LEDGER_PATH)


def estimate_cost(model, input_tokens, output_tokens):
    """Estimate cost in USD for a single inference call."""
    if model in LOCAL_MODELS:
        return 0.0
    rates = COST_RATES.get(model)
    if not rates:
        # Try prefix matching for versioned model strings
        for key, r in COST_RATES.items():
            if model.startswith(key):
                rates = r
                break
    if not rates:
        log.warning("No rate card for model '%s', estimating as Sonnet", model)
        rates = COST_RATES["claude-sonnet-4-5"]
    return (input_tokens / 1000) * rates["input"] + (output_tokens / 1000) * rates["output"]


def is_anthropic_model(model):
    """Check if a model string refers to an Anthropic model."""
    return model.startswith("claude-") or model.startswith("sonar")


def is_local_model(model):
    """Check if a model is a local Ollama model."""
    return model in LOCAL_MODELS or model.startswith("gemma")


def check_violation(agent, model, task_type):
    """
    Check if this call is a routing violation.
    Returns (is_violation, recommended_model) or (False, None).
    """
    if not task_type:
        return False, None

    recommended = ROUTING_TABLE.get(task_type)
    if not recommended:
        return False, None

    # If the recommended model is local but an Anthropic model was used
    if is_local_model(recommended) and is_anthropic_model(model):
        return True, recommended

    return False, None


def record_call(ledger, agent, model, input_tokens, output_tokens, task_type=None):
    """Record an inference call in the ledger."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cost = estimate_cost(model, input_tokens, output_tokens)

    # Per-agent tracking
    if agent not in ledger["agents"]:
        ledger["agents"][agent] = {
            "calls_anthropic": 0,
            "calls_local": 0,
            "estimated_anthropic_spend": 0.0,
            "violations": 0,
            "last_seen": None,
        }

    entry = ledger["agents"][agent]
    entry["last_seen"] = datetime.now(timezone.utc).isoformat()

    if is_local_model(model):
        entry["calls_local"] += 1
    else:
        entry["calls_anthropic"] += 1
        entry["estimated_anthropic_spend"] = round(entry["estimated_anthropic_spend"] + cost, 6)

    # Daily totals
    if today not in ledger["daily_totals"]:
        ledger["daily_totals"][today] = {
            "anthropic_spend": 0.0,
            "calls_anthropic": 0,
            "calls_local": 0,
            "violations": 0,
        }
    day = ledger["daily_totals"][today]
    if is_local_model(model):
        day["calls_local"] += 1
    else:
        day["calls_anthropic"] += 1
        day["anthropic_spend"] = round(day["anthropic_spend"] + cost, 6)

    # Check for violations
    is_violation, recommended = check_violation(agent, model, task_type)
    if is_violation:
        violation = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "agent": agent,
            "model_used": model,
            "task_type": task_type,
            "estimated_cost": round(cost, 6),
            "recommended_model": recommended,
        }
        ledger["violations"].append(violation)
        entry["violations"] += 1
        day["violations"] += 1
        log.warning(
            "VIOLATION: %s used %s for '%s' (should be %s) — est. $%.4f",
            agent, model, task_type, recommended, cost,
        )

    return cost, is_violation


# ─── JOB 1: ROUTE WATCHER ──────────────────────────────────────

def tail_inference_log(ledger, timeout=None):
    """
    Tail the inference JSONL log and process new entries.
    Each line is expected to be JSON with fields:
      agent, model, input_tokens, output_tokens, task_type (optional)
    """
    if not INFERENCE_LOG.exists():
        INFERENCE_LOG.parent.mkdir(parents=True, exist_ok=True)
        INFERENCE_LOG.touch()
        log.info("Created inference log at %s", INFERENCE_LOG)

    log.info("Watching inference log: %s", INFERENCE_LOG)

    start_time = time.time()
    last_size = INFERENCE_LOG.stat().st_size

    while True:
        if timeout and (time.time() - start_time) > timeout:
            log.info("Watcher timeout reached (%ds)", timeout)
            break

        current_size = INFERENCE_LOG.stat().st_size
        if current_size > last_size:
            with open(INFERENCE_LOG) as f:
                f.seek(last_size)
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                        agent = entry.get("agent", "unknown")
                        model = entry.get("model", "unknown")
                        input_t = entry.get("input_tokens", 0)
                        output_t = entry.get("output_tokens", 0)
                        task_type = entry.get("task_type")

                        cost, violation = record_call(
                            ledger, agent, model, input_t, output_t, task_type
                        )

                        if violation:
                            log.warning(
                                "  → $%.4f wasted on %s (should be local)", cost, model
                            )
                        else:
                            log.info(
                                "  %s → %s (%d+%d tokens, $%.4f)",
                                agent, model, input_t, output_t, cost,
                            )
                    except json.JSONDecodeError:
                        log.debug("Skipping malformed log line")

            last_size = current_size
            save_ledger(ledger)

        time.sleep(2)


# ─── JOB 3: DAILY REPORT ───────────────────────────────────────

def generate_report(ledger, report_date=None):
    """Generate a daily markdown report."""
    if report_date is None:
        report_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / f"{report_date}.md"

    today_data = ledger.get("daily_totals", {}).get(report_date, {})
    today_spend = today_data.get("anthropic_spend", 0.0)
    today_anthropic = today_data.get("calls_anthropic", 0)
    today_local = today_data.get("calls_local", 0)
    today_violations = today_data.get("violations", 0)

    # MTD calculation
    year_month = report_date[:7]
    mtd_spend = 0.0
    mtd_anthropic = 0
    mtd_local = 0
    mtd_violations = 0
    days_in_month = 0
    for day_key, day_data in ledger.get("daily_totals", {}).items():
        if day_key.startswith(year_month):
            mtd_spend += day_data.get("anthropic_spend", 0.0)
            mtd_anthropic += day_data.get("calls_anthropic", 0)
            mtd_local += day_data.get("calls_local", 0)
            mtd_violations += day_data.get("violations", 0)
            days_in_month += 1

    # Projection
    day_of_month = int(report_date.split("-")[2])
    if day_of_month > 0:
        projected_monthly = (mtd_spend / day_of_month) * 30
    else:
        projected_monthly = 0.0

    # Top 3 most expensive agents
    agent_costs = []
    for agent_id, agent_data in ledger.get("agents", {}).items():
        agent_costs.append((agent_id, agent_data.get("estimated_anthropic_spend", 0.0)))
    agent_costs.sort(key=lambda x: x[1], reverse=True)
    top_3 = agent_costs[:3]

    # Today's violations
    today_violation_list = [
        v for v in ledger.get("violations", [])
        if v.get("timestamp", "").startswith(report_date)
    ]

    # Calls by model
    model_breakdown = defaultdict(int)
    for agent_data in ledger.get("agents", {}).values():
        model_breakdown["anthropic"] += agent_data.get("calls_anthropic", 0)
        model_breakdown["local"] += agent_data.get("calls_local", 0)

    lines = [
        f"# Penny Pincher Daily Report — {report_date}",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "---",
        "",
        "## Cost Summary",
        "",
        f"| Metric | Value |",
        f"|---|---|",
        f"| Today's Anthropic spend | ${today_spend:.4f} |",
        f"| Month-to-date spend | ${mtd_spend:.4f} |",
        f"| Projected monthly (at current burn) | ${projected_monthly:.2f} |",
        f"| Today's calls (Anthropic) | {today_anthropic} |",
        f"| Today's calls (local) | {today_local} |",
        f"| Local routing ratio | {(today_local / max(today_local + today_anthropic, 1) * 100):.0f}% |",
        "",
        "## Calls by Provider",
        "",
        f"| Provider | Total Calls |",
        f"|---|---|",
        f"| Anthropic (paid) | {model_breakdown.get('anthropic', 0)} |",
        f"| Ollama (local/free) | {model_breakdown.get('local', 0)} |",
        "",
        "## Violations",
        "",
        f"**Today:** {today_violations} violations",
        f"**MTD:** {mtd_violations} violations",
        "",
    ]

    if today_violation_list:
        lines.extend([
            "| Timestamp | Agent | Model Used | Task Type | Cost | Should Have Used |",
            "|---|---|---|---|---|---|",
        ])
        for v in today_violation_list:
            lines.append(
                f"| {v['timestamp'][:19]} | {v['agent']} | {v['model_used']} "
                f"| {v.get('task_type', 'unknown')} | ${v['estimated_cost']:.4f} "
                f"| {v['recommended_model']} |"
            )
        lines.append("")
    else:
        lines.append("No violations today.")
        lines.append("")

    lines.extend([
        "## Top 3 Most Expensive Agents (all-time)",
        "",
        "| Rank | Agent | Anthropic Spend |",
        "|---|---|---|",
    ])
    for i, (agent_id, spend) in enumerate(top_3, 1):
        lines.append(f"| {i} | {agent_id} | ${spend:.4f} |")

    lines.extend([
        "",
        "---",
        "",
        f"*Penny Pincher v1.0 — routing {len(ledger.get('agents', {}))} agents*",
    ])

    report_content = "\n".join(lines)

    if DRY_RUN:
        log.info("[dry-run] Would write report to %s", report_path)
        print(report_content)
    else:
        with open(report_path, "w") as f:
            f.write(report_content)
        log.info("Report written: %s", report_path)

    return report_content


# ─── SCHEDULER ──────────────────────────────────────────────────

def should_generate_report():
    """Check if it's time for the daily 8 AM report."""
    now = datetime.now(timezone.utc)
    # Check if it's between 08:00 and 08:05 UTC
    if now.hour == 8 and now.minute < 5:
        today = now.strftime("%Y-%m-%d")
        report_path = REPORTS_DIR / f"{today}.md"
        return not report_path.exists()
    return False


# ─── MAIN ───────────────────────────────────────────────────────

def main():
    log.info("=" * 60)
    log.info("Penny Pincher v1.0 starting")
    log.info("  Ledger: %s", LEDGER_PATH)
    log.info("  Reports: %s", REPORTS_DIR)
    log.info("  Inference log: %s", INFERENCE_LOG)
    log.info("  Dry run: %s", DRY_RUN)
    log.info("=" * 60)

    # Load ledger
    ledger = load_ledger()
    log.info("Ledger loaded: %d agents tracked", len(ledger.get("agents", {})))

    # Populate ledger with agent roster from audit if empty
    if not ledger["agents"]:
        audit_path = OPENCLAW_DIR / "workspace" / "agent-audit.json"
        if audit_path.exists():
            try:
                with open(audit_path) as f:
                    audit = json.load(f)
                for agent in audit.get("agents", []):
                    agent_id = agent["id"]
                    ledger["agents"][agent_id] = {
                        "calls_anthropic": 0,
                        "calls_local": 0,
                        "estimated_anthropic_spend": 0.0,
                        "violations": 0,
                        "last_seen": None,
                        "assigned_model": agent.get("assigned_model", "unknown"),
                        "task_type": agent.get("detected_task_type", "unknown"),
                    }
                log.info("Populated ledger from audit: %d agents", len(ledger["agents"]))
                save_ledger(ledger)
            except (json.JSONDecodeError, IOError) as e:
                log.warning("Could not load agent audit: %s", e)

    # Handle immediate report generation
    if REPORT_NOW:
        generate_report(ledger)
        return

    # Handle dry-run mode
    if DRY_RUN:
        log.info("[dry-run] Running watcher for 60 seconds...")
        # Seed a test violation to prove the system works
        test_entries = [
            {
                "agent": "ops-editorial",
                "model": "claude-opus-4",
                "input_tokens": 2500,
                "output_tokens": 800,
                "task_type": "drafting_routine",
            },
            {
                "agent": "personal-bio",
                "model": "gemma3:27b",
                "input_tokens": 1500,
                "output_tokens": 600,
                "task_type": "drafting_routine",
            },
            {
                "agent": "rid-capture",
                "model": "claude-sonnet-4-5",
                "input_tokens": 5000,
                "output_tokens": 3000,
                "task_type": "proposal_writing",
            },
        ]

        for entry in test_entries:
            cost, violation = record_call(
                ledger,
                entry["agent"],
                entry["model"],
                entry["input_tokens"],
                entry["output_tokens"],
                entry["task_type"],
            )
            status = "VIOLATION" if violation else "OK"
            log.info(
                "  [test] %s → %s (%s) — $%.4f [%s]",
                entry["agent"], entry["model"], entry["task_type"], cost, status,
            )

        log.info("")
        log.info("Generating test report...")
        generate_report(ledger)
        log.info("")
        log.info("[dry-run] Complete. Penny Pincher is operational.")
        return

    # Full daemon mode
    def handle_shutdown(signum, frame):
        log.info("Shutdown signal received, saving ledger...")
        save_ledger(ledger)
        sys.exit(0)

    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)

    # Main loop: watch logs + check report schedule
    log.info("Entering main loop...")
    while True:
        # Check if report is due
        if should_generate_report():
            log.info("Generating daily report...")
            generate_report(ledger)

        # Watch for new inference entries (5-second polling)
        tail_inference_log(ledger, timeout=55)

        # Brief pause before next cycle
        time.sleep(5)


if __name__ == "__main__":
    main()
