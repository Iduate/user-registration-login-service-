import json
import re
from typing import Dict, List

COMMON = {"password", "password123", "123456", "qwerty", "letmein", "admin"}


def check_strength(password: str) -> List[str]:
    reasons: List[str] = []

    if len(password) < 12:
        reasons.append("too_short")
    if len(password) > 128:
        reasons.append("too_long")
    if not re.search(r"[a-z]", password):
        reasons.append("no_lowercase")
    if not re.search(r"[A-Z]", password):
        reasons.append("no_uppercase")
    if not re.search(r"\d", password):
        reasons.append("no_number")
    if not re.search(r"[^a-zA-Z0-9]", password):
        reasons.append("no_symbol")
    if password.lower() in COMMON:
        reasons.append("too_common")

    return reasons


def handler(event, context):
    try:
        body = event.get("body")
        if isinstance(body, str):
            body = json.loads(body)
        if not isinstance(body, dict):
            body = event

        pwd = body.get("password", "")
        reasons = check_strength(pwd)
        ok = len(reasons) == 0
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"ok": ok, "reasons": reasons}),
        }
    except Exception as e:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"ok": False, "reasons": ["invalid_payload"], "error": str(e)}),
        }


if __name__ == "__main__":
    # quick demo
    sample = {"password": "StrongPassword1!"}
    print(handler({"body": json.dumps(sample)}, None))
