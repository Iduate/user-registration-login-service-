from password_strength_lambda import handler  # re-export for convenience

# Optional: allow local quick run
if __name__ == "__main__":
    import json
    evt = {"body": json.dumps({"password": "StrongPassword1!"})}
    print(handler(evt, None))
