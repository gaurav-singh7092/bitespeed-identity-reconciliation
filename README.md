# Bitespeed Identity Reconciliation Service

A backend service that identifies and consolidates contact information across multiple requests. Built with **Node.js**, **TypeScript**, **Express**, and **Prisma** (PostgreSQL).

## Live Endpoint

**Base URL:** _https://bitespeed-backend-gsin.onrender.com_

### `POST /identify`

```bash
curl -X POST https://bitespeed-backend-gsin.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "mcfly@hillvalley.edu", "phoneNumber": "123456"}'
```

#### Request

```json
{
  "email": "string | null",
  "phoneNumber": "string | null"
}
```

At least one of `email` or `phoneNumber` must be provided.

#### Response

```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["primary@example.com", "secondary@example.com"],
    "phoneNumbers": ["123456", "789012"],
    "secondaryContactIds": [2, 3]
  }
}
```

## Reconciliation Rules

| Scenario | Behaviour |
|----------|-----------|
| No existing match | Create a new **primary** contact |
| Match found, but request has new email/phone | Create a **secondary** contact linked to the primary |
| Request links two separate primary contacts | The **newer** primary is demoted to secondary under the **older** one |
| Exact duplicate request | Idempotent — returns existing cluster, no new records |

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express
- **ORM:** Prisma
- **Database:** PostgreSQL (SQLite for local dev)
- **Hosting:** Render

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Set up environment (SQLite for local)
echo 'DATABASE_URL="file:./dev.db"' > .env

# 3. Update prisma schema provider to "sqlite" for local dev, then:
npx prisma migrate dev --name init

# 4. Run
npm run dev
```

The server starts on `http://localhost:8000`.

## Project Structure

```
src/
├── index.ts        Express app, routes, validation
├── service.ts      Core /identify reconciliation logic
└── types.ts        Request & response TypeScript interfaces
prisma/
└── schema.prisma   Contact model definition
```
