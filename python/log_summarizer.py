import argparse
import json
from collections import Counter
from typing import Dict, Iterable


def anonymize(email: str) -> str:
    try:
        user, domain = email.split("@", 1)
        return f"{user[:3]}***@{domain}"
    except Exception:
        return "***"


def iter_logs(path: str) -> Iterable[Dict]:
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except Exception:
                continue


def summarize(path: str) -> str:
    reg = 0
    login_ok = 0
    login_fail = 0
    fail_by_email: Counter = Counter()

    for rec in iter_logs(path):
        event = rec.get("event") or rec.get("msg")  # support logger.ts msg field
        email = str(rec.get("email") or rec.get("user") or "")

        if event == "user_registered":
            reg += 1
        elif event == "login_success":
            login_ok += 1
        elif event in ("login_failed", "login_failed_bad_password", "login_failed_user_missing"):
            login_fail += 1
            if email:
                fail_by_email[anonymize(email)] += 1

    top5 = ", ".join(
        f"{k} ({v})" for k, v in fail_by_email.most_common(5)
    ) or "-"

    lines = [
        f"total_registrations: {reg}",
        f"total_login_successes: {login_ok}",
        f"total_login_failures: {login_fail}",
        f"top_failure_emails: {top5}",
    ]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Summarize auth logs")
    parser.add_argument("path", help="Path to logs.jsonl")
    args = parser.parse_args()
    print(summarize(args.path))


if __name__ == "__main__":
    main()
