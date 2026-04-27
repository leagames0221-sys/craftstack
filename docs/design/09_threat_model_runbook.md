---
name: 脅威モデル + Runbook + レート制限 + データ保持
type: project
---

> ⚠️ **設計フェーズ文書 (2026-04-22)** — v0.5.2 で ship 済の同名成果物が `docs/security/threat-model.md` / `docs/ops/runbook.md` / `docs/compliance/data-retention.md` に存在 (こちらが authoritative)。コスト面の追加 defence は [ADR-0046](../adr/0046-zero-cost-by-construction.md) + [`COST_SAFETY.md`](../../COST_SAFETY.md) 参照。データ保持の自動 cleanup job は v0.5.2 時点で未 ship (v0.6.0 roadmap)。

# 欠落成果物補完:セキュリティ/運用/コンプライアンス

## 1. STRIDE 脅威モデル(`docs/security/threat-model.md`)

### Spoofing(なりすまし)

| ID   | 脅威                   | 対策                                                         |
| ---- | ---------------------- | ------------------------------------------------------------ |
| S-01 | セッション cookie 窃取 | HttpOnly + Secure + SameSite=Lax + \_\_Secure- prefix + HSTS |
| S-02 | CSRF                   | Auth.js トークン + SameSite=Lax                              |
| S-03 | OAuth state fixation   | Auth.js state/PKCE                                           |
| S-04 | API キー推測           | Argon2 ハッシュ + klx\_ prefix + 64 char random              |

### Tampering(改ざん)

| ID   | 脅威                     | 対策                                       |
| ---- | ------------------------ | ------------------------------------------ |
| T-01 | WebSocket メッセージ偽装 | 接続認証 + board:join で membership 検証   |
| T-02 | version 省略で強制上書き | Zod 必須、欠落 400                         |
| T-03 | Webhook ペイロード改ざん | HMAC-SHA256 署名、受信側検証               |
| T-04 | MIME 偽装                | file-type(magic bytes)+ 拡張子 + MIME 三重 |

### Repudiation(否認)

| ID   | 脅威               | 対策                                           |
| ---- | ------------------ | ---------------------------------------------- |
| R-01 | 削除隠蔽           | AuditLog append-only、actor SetNull で記録保持 |
| R-02 | API キー利用の否認 | ApiKey.lastUsedAt + AuditLog.action=API_CALL   |

### Information Disclosure(漏洩)

| ID   | 脅威                       | 対策                                              |
| ---- | -------------------------- | ------------------------------------------------- |
| I-01 | cross-tenant 参照          | RLS + アプリ層二重防御(ADR-0010)                  |
| I-02 | エラー内部情報露出         | 本番 stack trace 抑制、標準 Error schema          |
| I-03 | 検索結果経由の情報推定     | Rate limit + 5 hits 上限                          |
| I-04 | ログ PII 混入              | pino redact で email/token 自動マスク             |
| I-05 | プロンプトインジェクション | System/User/Document タグ分離 + `<document>` 埋込 |

### Denial of Service

| ID   | 脅威              | 対策                                             |
| ---- | ----------------- | ------------------------------------------------ |
| D-01 | 大量 WS 接続      | 1 user 5 同時上限、Fly.io Anycast                |
| D-02 | 巨大アップロード  | presign で sizeBytes 検証、R2 50MB ポリシー      |
| D-03 | 再帰的フォルダ    | 深さ 10 上限を API 検証                          |
| D-04 | Gemini 枠食い潰し | user 単位 rate limit(search 30/min、chat 10/min) |

### Elevation of Privilege

| ID   | 脅威                  | 対策                                            |
| ---- | --------------------- | ----------------------------------------------- |
| E-01 | Viewer が PATCH       | API + WS 両層で role 検証                       |
| E-02 | 不正 API キースコープ | scopes 配列で ingest/search/chat 分離           |
| E-03 | SQLi                  | Prisma パラメータ化、raw は Prisma.sql タグ必須 |

## 2. 障害対応 Runbook(`docs/ops/runbook.md`)

### 目次

1. Quick Reference
2. DB(Neon)Down
3. Redis(Upstash)Down
4. Socket.IO Server Down(Fly.io)
5. Gemini API Rate Limit
6. R2 Storage Down
7. 高レイテンシ検知時の切り分け
8. データ破損の復旧
9. インシデント報告テンプレ

### 例:DB Down 時

**症状**:

- /api/me が 500
- Sentry に PrismaClientInitializationError 多発

**切り分け**:

1. Neon console でプロジェクト状態確認
2. `psql $DIRECT_DATABASE_URL -c "SELECT 1"` 疎通
3. UptimeRobot 履歴で開始時刻特定

**対応**:

- Read only モード: Vercel env `READ_ONLY=1` セット → 再デプロイ
  → mutation は 503 `{code: "READ_ONLY"}` 返却
- Redis セッションから閲覧のみ許可
- Neon 復旧後 READ_ONLY 解除

**再発防止**:

- UptimeRobot で 4 分毎 ping(Neon アイドル防止)
- 月次 DT 1 時間超で Neon Pro($19/月)昇格基準

### Redis Down 時

**症状**: Socket.IO broadcast が片系のみに反映、rate limit 素通し

**対応**:

- Redis 不在時は単一インスタンス運用にフォールバック(ENV `SINGLE_NODE=1`)
- rate limit は in-memory LRU にフォールバック(upstash ratelimit 公式 fallback)
- 5 分で Upstash 復旧しない場合 Fly.io インスタンス数を 1 に減らす

### Gemini Rate Limit 時

**対応**:

- Groq Llama 3.3 に自動切替(ADR-0011 fallback chain)
- ユーザーに「現在混雑しています、しばらくお待ちください」トースト
- Usage dashboard で枠消費率可視化

## 3. API レート制限(`docs/api/rate-limits.md`)

### Boardly

| エンドポイント        | per-user | per-IP  | per-workspace |
| --------------------- | -------- | ------- | ------------- |
| POST /api/workspaces  | 10/hour  | 30/hour | —             |
| POST /api/invitations | 30/hour  | —       | 100/hour      |
| POST /api/cards       | 120/min  | —       | 600/min       |
| PATCH /api/cards/:id  | 120/min  | —       | 600/min       |
| POST /api/comments    | 60/min   | —       | —             |
| GET /api/search       | 60/min   | 300/min | —             |
| WS 接続               | 5 同時   | —       | —             |

### Knowlex

| エンドポイント                       | per-user | per-tenant  | per-IP  |
| ------------------------------------ | -------- | ----------- | ------- |
| POST /api/documents/upload-presign   | 30/hour  | 500/day     | —       |
| POST /api/conversations/:id/messages | 10/min   | 500/day     | —       |
| GET /api/search                      | 30/min   | 1000/day    | —       |
| API キー経由 chat                    | —        | scopes 準拠 | 100/min |

実装(`@upstash/ratelimit`):

```typescript
export const chatLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "rl:chat:user",
  analytics: true,
});
const { success, reset } = await chatLimit.limit(userId);
if (!success) throw new TooManyRequestsError({ retryAfter: reset });
```

## 4. データ保持ポリシー(`docs/compliance/data-retention.md`)

### 論理削除 → 物理削除

| エンティティ       | 期限                               |
| ------------------ | ---------------------------------- |
| Workspace / Tenant | 30 日後                            |
| Document           | 30 日後(R2 オブジェクトも同時削除) |
| Conversation       | 90 日後                            |
| AuditLog           | 365 日保持、その後削除             |
| Session            | 期限切れ後 7 日                    |
| VerificationToken  | 24 時間                            |

### 削除ジョブ

BullMQ repeatable job、毎日 03:00 JST 実行。
削除件数は Better Stack で可視化。

### ユーザー消去要求(GDPR 相当)

- `DELETE /api/me` で論理削除 + 30 日後完全消去
- テナント Owner の場合は譲渡完了後のみ受付
