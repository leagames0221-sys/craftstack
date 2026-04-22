---
name: Phase 5 - OpenAPI 仕様書
type: project
---

# Phase 5(γ): OpenAPI 仕様書

両アプリ分の `openapi.yaml` を `docs/api/` に配置。`openapi-typescript` で型自動生成 → `packages/api-client` に反映。

## ファイル配置

- `docs/api/collab-openapi.yaml`(Boardly)
- `docs/api/knowledge-openapi.yaml`(Knowlex)
- `packages/api-client/src/collab.d.ts`(自動生成、コミット対象)
- `packages/api-client/src/knowledge.d.ts`(自動生成、コミット対象)

## Boardly エンドポイント一覧(全 58)

### Auth

- GET /api/me
- PATCH /api/me

### Workspaces

- GET/POST /api/workspaces
- GET/PATCH/DELETE /api/workspaces/:slug
- POST /api/workspaces/:slug/restore

### Members/Invitations

- GET /api/workspaces/:slug/members
- PATCH/DELETE /api/workspaces/:slug/members/:userId
- POST /api/workspaces/:slug/invitations
- POST /api/workspaces/:slug/invitations/:id/resend
- DELETE /api/workspaces/:slug/invitations/:id
- POST /api/invitations/:token/accept

### Boards

- GET/POST /api/workspaces/:slug/boards
- GET/PATCH/DELETE /api/boards/:id
- POST /api/boards/:id/archive
- POST /api/boards/:id/export?format=json|csv

### Lists

- POST /api/boards/:id/lists
- PATCH/DELETE /api/lists/:id

### Cards

- POST /api/lists/:id/cards
- GET/PATCH/DELETE /api/cards/:id (PATCH は version 必須で 409)
- POST /api/cards/:id/move
- POST/DELETE /api/cards/:id/assignees/:userId
- POST/DELETE /api/cards/:id/labels/:labelId

### Labels

- GET/POST /api/workspaces/:slug/labels
- PATCH/DELETE /api/labels/:id

### Comments

- POST /api/cards/:id/comments
- PATCH/DELETE /api/comments/:id

### Attachments

- POST /api/cards/:id/attachments/presign
- POST /api/cards/:id/attachments/confirm
- DELETE /api/attachments/:id

### Activity / Search / Notifications

- GET /api/workspaces/:slug/activity
- GET /api/workspaces/:slug/search
- GET /api/notifications
- POST /api/notifications/read-all
- POST /api/notifications/subscribe

## Knowlex エンドポイント一覧

### Auth / Tenants

- GET /api/me
- GET/POST /api/tenants
- GET/PATCH/DELETE /api/tenants/:slug

### Members

- GET /api/tenants/:slug/members
- POST /api/tenants/:slug/invitations
- POST /api/invitations/:token/accept

### Folders

- GET/POST /api/tenants/:slug/folders
- PATCH/DELETE /api/folders/:id

### Documents

- POST /api/tenants/:slug/documents/upload-presign
- POST /api/tenants/:slug/documents/upload-confirm
- POST /api/tenants/:slug/documents/url-ingest
- POST /api/tenants/:slug/documents/text-ingest
- GET /api/tenants/:slug/documents
- GET/PATCH/DELETE /api/documents/:id
- POST /api/documents/:id/reindex
- GET /api/documents/:id/progress(SSE)

### Search / Conversations

- GET /api/tenants/:slug/search?mode=hybrid|vector|keyword
- GET/POST /api/tenants/:slug/conversations
- GET/DELETE /api/conversations/:id
- POST /api/conversations/:id/messages(SSE)
- POST /api/messages/:id/feedback
- GET /api/messages/:id/citations

### API Keys / Webhooks

- GET/POST /api/tenants/:slug/api-keys
- DELETE /api/api-keys/:id
- GET/POST /api/tenants/:slug/webhooks
- DELETE /api/webhooks/:id

### Usage / Audit / Export

- GET /api/tenants/:slug/usage
- GET /api/tenants/:slug/audit
- POST /api/tenants/:slug/export

## カスタム拡張(Critical 修正)

OpenAPI 3.1 security requirement に `role` のようなカスタムキーは書けないため、`x-required-roles` 拡張で表現:

```yaml
/api/workspaces/{slug}:
  patch:
    security:
      - sessionCookie: []
    x-required-roles: [OWNER, ADMIN]
    x-rate-limit: { perUser: "30/min" }
```

middleware ヘルパで読取り:

```typescript
const required = (openapi.paths[path][method] as any)["x-required-roles"];
if (required) await requireRole(userId, slug, required);
```

## セキュリティスキーム

```yaml
components:
  securitySchemes:
    sessionCookie:
      type: apiKey
      in: cookie
      name: __Secure-authjs.session-token
    bearerApiKey: # Knowlex のみ
      type: http
      scheme: bearer
      description: Tenant API key (prefix `klx_`)
```

## 型自動生成パイプライン

`packages/api-client/package.json`:

```json
{
  "scripts": {
    "generate:collab": "openapi-typescript ../../docs/api/collab-openapi.yaml -o ./src/collab.d.ts",
    "generate:knowledge": "openapi-typescript ../../docs/api/knowledge-openapi.yaml -o ./src/knowledge.d.ts",
    "generate": "pnpm generate:collab && pnpm generate:knowledge",
    "validate": "redocly lint ../../docs/api/collab-openapi.yaml && redocly lint ../../docs/api/knowledge-openapi.yaml"
  },
  "devDependencies": {
    "openapi-typescript": "^7.5.0",
    "@redocly/cli": "^1.25.0"
  }
}
```

利用例:

```typescript
import type { paths } from "@craftstack/api-client/collab";
type CreateBoardBody =
  paths["/api/workspaces/{slug}/boards"]["post"]["requestBody"]["content"]["application/json"];
```

## CI 契約検査

```yaml
- name: Validate OpenAPI specs
  run: pnpm --filter @craftstack/api-client validate
- name: Generate API types
  run: pnpm --filter @craftstack/api-client generate
- name: Ensure generated types committed
  run: |
    if ! git diff --exit-code -- packages/api-client/src; then
      echo "Regenerate api-client and commit"
      exit 1
    fi
```

## DoD

- [ ] 両 YAML が `redocly lint` 通過
- [ ] `openapi-typescript` が型生成し両アプリから import 可能
- [ ] CI 差分チェック実行
- [ ] `docs/api/*.html`(Redoc 生成)も配置
