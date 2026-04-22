# API rate limits

All limits are enforced via `@upstash/ratelimit` with a sliding window. Limits below are for authenticated sessions; anonymous traffic is rejected at auth time.

## Boardly

| Endpoint                                 | per user     | per IP    | per workspace |
| ---------------------------------------- | ------------ | --------- | ------------- |
| `POST /api/workspaces`                   | 10 / hour    | 30 / hour | —             |
| `POST /api/workspaces/:slug/invitations` | 30 / hour    | —         | 100 / hour    |
| `POST /api/lists/:id/cards`              | 120 / min    | —         | 600 / min     |
| `PATCH /api/cards/:id`                   | 120 / min    | —         | 600 / min     |
| `POST /api/cards/:id/comments`           | 60 / min     | —         | —             |
| `GET /api/workspaces/:slug/search`       | 60 / min     | 300 / min | —             |
| WebSocket handshake                      | 5 concurrent | —         | —             |

## Knowlex

| Endpoint                               | per user  | per tenant  | per IP    |
| -------------------------------------- | --------- | ----------- | --------- |
| `POST /api/documents/upload-presign`   | 30 / hour | 500 / day   | —         |
| `POST /api/conversations/:id/messages` | 10 / min  | 500 / day   | —         |
| `GET /api/search`                      | 30 / min  | 1,000 / day | —         |
| API-key-authenticated chat             | per scope | scoped      | 100 / min |

## Error shape

When a limit is hit the response is:

```json
{
  "code": "RATE_LIMITED",
  "message": "Too many requests",
  "details": { "retryAfter": 42 }
}
```

with HTTP 429 and an `Retry-After` header.

## Fallback

If Upstash Redis is unreachable, requests fall through to an in-process LRU
(`@upstash/ratelimit` built-in fallback) with a conservative 30 req/min default.
