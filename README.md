# Tezda Auth Service

Minimal, secure, and cost-effective user registration & login on AWS Lambda (TypeScript, Node.js 20). Uses DynamoDB + custom JWT (HS256 via Secrets Manager secret).

## Features
- Endpoints: POST /register, POST /login, POST /token/refresh
- DynamoDB single-table schema
- bcryptjs password hashing, zod validation
- Short-lived access tokens (<=15m), refresh token rotation with hashed storage
- Structured JSON logs + simple metrics to CloudWatch
- Basic abuse controls (failed attempts, lockout window); use API Gateway throttling too

## Project Structure
```
/src
  /handlers/auth.ts
  /lib/{db,crypto,jwt,validation,logger}.ts
  /types/dto.ts
/tests/*.test.ts
/infra/template.yaml (SAM)
/python/password_strength_lambda.py
/python/log_summarizer.py
```

## Environment Variables
- TABLE_NAME: DynamoDB table name
- JWT_SECRET_ARN or JWT_SECRET_PLAIN
- Optional: JWT_ISSUER, JWT_AUDIENCE, ACCESS_TOKEN_TTL_SECONDS (default 900),
  REFRESH_TOKEN_TTL_SECONDS (default 604800), LOCKOUT_THRESHOLD (5), LOCKOUT_MINUTES (15)

## Local Setup
```powershell
npm install
npm run build
npm test
```

### Sample curl
Replace BASE with your API base URL after deploy.
```powershell
# Register
curl -X POST "$env:BASE/register" -H "Content-Type: application/json" -d '{"email":"user@example.com","password":"StrongPassword1!","name":"User"}'

# Login
curl -X POST "$env:BASE/login" -H "Content-Type: application/json" -d '{"email":"user@example.com","password":"StrongPassword1!"}'

# Refresh (replace with the refresh token from login)
curl -X POST "$env:BASE/token/refresh" -H "Content-Type: application/json" -d '{"refreshToken":"<REFRESH_TOKEN>"}'
```

## Deploy with SAM (optional)
Pre-req: AWS CLI configured, SAM CLI installed.
```powershell
# Build TS
npm run build
# Package & deploy (provide your secret ARN)
sam deploy --template-file .\infra\template.yaml --stack-name tezda-auth --capabilities CAPABILITY_IAM --parameter-overrides JwtSecretArn=arn:aws:secretsmanager:REGION:ACCOUNT:secret:YOUR_SECRET
```

## API (JSON)
- POST /register
  - Request: { email, password, name }
  - Response: 201 { message: "Registered" }
- POST /login
  - Request: { email, password }
  - Response: 200 { accessToken, refreshToken }
- POST /token/refresh
  - Request: { refreshToken }
  - Response: 200 { accessToken, refreshToken }

## Python Mini-Tasks
- password_strength_lambda.py
  - Input: { "password": "..." }
  - Output: { ok: boolean, reasons: string[] }
- log_summarizer.py
  - Input: logs.jsonl (one JSON per line)
  - Output: summary text to stdout

## Security Notes
## Token Model & Validation Strategy
- Custom JWT (HS256 via jose). Access token TTL default 15 min. Refresh tokens signed with jti and rotated on use.
- Token verification: issuer and audience enforced; refresh tokens validated to include token_use=refresh and a jti.
- Validation: zod schemas for register/login/refresh payloads; reasons returned for invalid payloads.

## Logs & Metrics
- Logs are structured JSON, e.g. `user_registered`, `login_success`, `login_failed_*` with limited PII.
- Simple metrics are emitted using CloudWatch-compatible JSON (Embedded Metric Format-style) with a Count value; can be turned into metric filters or used directly.
- Never log secrets or passwords; email is used sparingly and can be hashed.
- Prefer Secrets Manager for JWT secret; rotate regularly.
- Enforce API Gateway throttling (e.g., 10 RPS, burst 20) and WAF if needed.
- Consider KMS CMK for table encryption (DynamoDB SSE is enabled; CMK optional).

## Troubleshooting
- If Jest ESM errors: ensure tests use CommonJS require (as provided) and `npm test`.
- For DynamoDB TTL, confirm attribute `ttl` and that TTL is enabled on the table.
- Check CloudWatch logs for `user_registered`, `login_success`, `login_failed_*` events.
