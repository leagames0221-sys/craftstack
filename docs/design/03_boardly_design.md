---
name: Phase 2 - Boardly 設計完全版
type: project
---

# Phase 2: Boardly (apps/collab) 完全版設計

## プロダクト概要

小規模チーム(2〜10 名)向けリアルタイム協働カンバン。Notion/Trello の同時編集機能を、業務品質(権限・監査・a11y)で再構築する。

## 機能要件(F-01〜F-20 全実装)

| ID   | 機能                                           |
| ---- | ---------------------------------------------- |
| F-01 | OAuth 認証(Google + GitHub)                    |
| F-02 | ワークスペース管理(作成/編集/論理削除/復元)    |
| F-03 | 招待メール(期限付きトークン、再発行)           |
| F-04 | 4 階層 RBAC(OWNER/ADMIN/EDITOR/VIEWER)         |
| F-05 | ボード CRUD(カラー/アイコン/アーカイブ/並び順) |
| F-06 | リスト CRUD + LexoRank 並び + WIP 上限         |
| F-07 | カード CRUD(Markdown/期日/ラベル/担当者)       |
| F-08 | リアルタイム同期(Socket.IO + Redis Pub/Sub)    |
| F-09 | プレゼンス + カーソル + 編集ロック表示         |
| F-10 | 添付(R2 presigned、複数ファイル)               |
| F-11 | コメント(Markdown + メンション + 返信)         |
| F-12 | アクティビティログ(無限スクロール)             |
| F-13 | Web Push + メール + アプリ内トースト           |
| F-14 | 全文検索(tsvector + pg_trgm)                   |
| F-15 | ラベル管理(WS 単位、色、絞込)                  |
| F-16 | フィルタ/ソート                                |
| F-17 | キーボードショートカット(n/ / /esc 等)         |
| F-18 | 多言語(next-intl、JP/EN)                       |
| F-19 | ダークモード(システム追従 + 手動)              |
| F-20 | レスポンシブ + タッチ DnD                      |

## 追加品質装置

- Undo/Redo(20 ステップ)
- 楽観更新 + 失敗時ロールバック
- オフライン対応(IndexedDB 操作キュー、再接続時同期)
- 差分同期(初回 snapshot 後はイベントのみ)
- 監査ダッシュボード(Owner 向け)
- エクスポート(JSON/CSV)
- API レート制限(Upstash)
- 構造化ログ(pino + Better Stack)
- Sentry(source map 付き)
- Web Vitals 収集

## 非機能要件

- 1 ボード 20 クライアント同時、1 インスタンス 200 接続
- WS 往復 p95 < 120ms(ローカル)/ < 300ms(Fly.io)
- API p95 < 200ms
- 稼働率 99.5%
- LCP/INP/CLS Good しきい値
- a11y WAI-ARIA 準拠、axe-core violation 0

## ER 図サマリ(詳細は 05_prisma_schemas.md)

エンティティ:

- User, Account, Session, VerificationToken(Auth.js adapter)
- Workspace, Membership, Invitation
- Board, List, Card, Label, CardLabel, CardAssignee
- Comment, Mention, Attachment
- ActivityLog, Notification, NotificationSubscription

設計勘所:

- LexoRank で List/Card 並び替え O(1)
- version 列で楽観ロック
- slug でワークスペース URL `/w/{slug}`
- ActivityLog.payload = JSONB で将来拡張
- NotificationSubscription = Web Push VAPID 用

## 権限マトリクス(4 階層)

| 操作                      | OWNER | ADMIN | EDITOR | VIEWER |
| ------------------------- | :---: | :---: | :----: | :----: |
| WS 削除                   |   ✓   |       |        |        |
| Owner 譲渡                |   ✓   |       |        |        |
| メンバー招待/ロール変更   |   ✓   |   ✓   |        |        |
| メンバー除名(Owner 除く)  |   ✓   |   ✓   |        |        |
| ラベル作成/削除           |   ✓   |   ✓   |   ✓    |        |
| ボード/リスト/カード CRUD |   ✓   |   ✓   |   ✓    |        |
| コメント投稿              |   ✓   |   ✓   |   ✓    |   ✓    |
| 閲覧・検索                |   ✓   |   ✓   |   ✓    |   ✓    |
| 監査ダッシュボード        |   ✓   |   ✓   |        |        |

API 層 + WebSocket 層の両方で検証(Defense in Depth)。

## REST API(全 58 エンドポイント、詳細は 06_openapi_specs.md)

主要グループ: auth / workspaces / members / invitations / boards / lists / cards / labels / comments / attachments / activity / search / notifications / insights

## WebSocket(Socket.IO、namespace `/boards` 固定)

Client → Server:

- `board:join { boardId }` → snapshot ack 返却
- `cursor:move { x, y, elementId? }`
- `card:lock / card:unlock { cardId }`
- `typing:start / typing:stop { cardId, field }`
- `presence:heartbeat { }`

Server → Client:

- `board:snapshot { board, lists, cards, labels, members }`
- `presence:update { users: [{id, cursor, lockedCardId, typing}] }`
- `board:updated { entity, op, data, version }`
- `comment:appended { cardId, comment }`
- `activity:appended { log }`
- `notification:new { notification }`
- `error { code, message, retryable }`

認証: ハンドシェイク時に `io.use(middleware)` で Auth.js `getToken()` 検証。board:join 時に membership 検証。

## リアルタイム競合解決

| シナリオ                  | 方式                                |
| ------------------------- | ----------------------------------- |
| カード編集(タイトル/説明) | 楽観ロック version、409 時マージ UI |
| 並び替え                  | LexoRank(衝突時のみ rebalance)      |
| カーソル                  | broadcast only(DB 非永続)           |

## テスト(全レイヤ)

| レイヤ      | ツール                      | 対象                          | カバレッジ目標   |
| ----------- | --------------------------- | ----------------------------- | ---------------- |
| Unit        | Vitest                      | utils / LexoRank / RBAC / Zod | 90%              |
| Integration | Vitest + Testcontainers     | Prisma リポジトリ             | 80%              |
| API         | Vitest + supertest          | REST + 認可                   | 全エンドポイント |
| WebSocket   | Vitest + socket.io-client   | 全イベント + 競合             | 全イベント       |
| Contract    | Vitest + openapi-typescript | schema 整合                   | 全 endpoint      |
| E2E         | Playwright                  | 10 シナリオ                   | 主要 10 本       |
| A11y        | axe-core                    | 全画面                        | violation 0      |
| Visual      | Playwright screenshot       | 主要画面                      | diff 2%          |
| Load        | k6                          | 200 同時 WS                   | 成功率 99%       |

## E2E 必達 10 シナリオ

1. OAuth(Google+GitHub)ログイン
2. WS 作成 → 招待 → 別ユーザー参加
3. ボード作成 → リスト/カード作成 → DnD 移動
4. 2 ブラウザ同時接続 → 操作の即時反映
5. カードコメント + メンション → 通知着弾
6. ファイル添付(画像)→ R2 アップ → ダウンロード
7. Viewer ロールは編集 disabled
8. 検索で日本語+英語横断ヒット
9. ダークモード + 多言語切替
10. オフライン編集 → 再接続で同期

## セキュリティ要件(全実装)

- CSRF(Auth.js トークン)
- XSS(React エスケープ + DOMPurify + CSP)
- SQLi(Prisma パラメータ化)
- 認可(API + WS 両層で membership 検証)
- レート制限(Upstash、user + IP)
- アップロード(MIME + 拡張子 + magic bytes 三重)
- 秘密情報(GitHub Secrets、.env は gitignore)
- HSTS / CSP / X-Frame-Options / Referrer-Policy
- Mozilla Observatory スコア A 以上
- CI に `pnpm audit`、Dependabot / Renovate

## 実装マイルストーン(Week 3-10、8 週)

| 週      | DoD                                                                                     |
| ------- | --------------------------------------------------------------------------------------- |
| Week 3  | Prisma 全テーブル + Auth.js Google/GitHub + ログイン→ダッシュボード                     |
| Week 4  | WS CRUD + 4 階層 RBAC + 招待メール + 権限テスト全緑                                     |
| Week 5  | ボード/リスト/カード CRUD + LexoRank + 楽観ロック + ラベル + 担当者                     |
| Week 6  | Socket.IO + Redis Pub/Sub + snapshot + プレゼンス + カーソル + 編集ロック               |
| Week 7  | コメント + メンション + Web Push + メール + 添付 R2 + 検索 tsvector                     |
| Week 8  | アクティビティ + 監査 dashboard + Undo/Redo + オフライン + エクスポート                 |
| Week 9  | 多言語 + ダークモード + a11y + Visual Regression + Load test k6                         |
| Week 10 | Fly.io/Vercel デプロイ + 観測(Sentry/BetterStack/UptimeRobot)+ README + デモ動画 + 公開 |

## 公開 URL(予定)

- https://boardly.app または https://boardly.fly.dev
