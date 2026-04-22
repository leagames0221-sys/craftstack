---
name: 自己レビューで判明した Critical/High 修正パッチ
type: project
---

# 自己レビュー修正パッチ(2026-04-22 反映済)

レビュー指摘を設計書に取り込んだ最終版の要点。実装時はこの仕様に従う。

## Critical 5 件(必須修正反映済)

### C-1. Prisma onDelete 明示

- `ActivityLog.actor` → **SetNull**(actorId nullable化、監査証跡を残す)
- `Invitation.inviter` → **SetNull**(inviterId nullable化)
- Boardly/Knowlex schema の全 FK に onDelete を明示

### C-2. Knowlex Document の tenant 絞込

- `Document.owner` の User 参照はあくまで作成者。**テナント分離は tenantId のみで行う**
- ADR-0010 補足: Document 取得 API は必ず tenantId で絞る

### C-3. OpenAPI カスタム拡張 正規化

- `security: [{ sessionCookie: [], role: [...] }]` は OpenAPI 3.1 非対応
- `x-required-roles: [OWNER, ADMIN]` + `x-rate-limit` のカスタム拡張で表現
- middleware helper で読取り → `requireRole()` 自動適用

### C-4. RLS から Tenant テーブル除外

- `Tenant` 本体に RLS を張ると一覧取得が空になる
- 代わりに `TenantMember` 経由で可視性を絞る
- API 層ヘルパ `resolveTenant(slug, userId)` で member 検証

### C-5. Socket.IO namespace 固定

- パスパラメータは namespace に使えない(Socket.IO 仕様)
- `/ws/board/:boardId` は誤り → namespace は **`/boards` 固定**
- `board:join { boardId }` イベントで membership 検証
- `io.use(middleware)` で Auth.js `getToken()` ハンドシェイク検証

## High 6 件(強く推奨、設計に反映済)

### H-1. 無料インフラ運用制約 → ADR-0016 追加

| Provider | 制約             | 緩和策                                               |
| -------- | ---------------- | ---------------------------------------------------- |
| Neon     | 5 分アイドル停止 | UptimeRobot 4 分毎 ping                              |
| Upstash  | 10,000 cmd/day   | presence heartbeat 60s、broadcast 差分のみ           |
| Fly.io   | 256MB OOM        | `--max-old-space-size=200`、binaryTarget native 限定 |
| Gemini   | 1,500/day        | Eval PR=10 問、main/nightly=50 問                    |
| Cohere   | 1000/月          | cross-encoder ローカル fallback                      |
| Resend   | 3000/月          | 1 時間集約通知                                       |

### H-2. Web Push iOS 制限明記

- Chromium/Firefox/macOS Safari 対応、iOS は PWA インストール前提
- README に明記

### H-3. Gemini embedding モデル名注意

- `text-embedding-004` は `gemini-embedding-001` にリネームの可能性
- ADR-0012 で最新ドキュメント参照を必須化
- Matryoshka 256/512/768 で 256 に下げる検討余地

### H-4. LexoRank 既存ライブラリ採用 → ADR-0021

- 自作せず `@hellopablo/lexorank` または `lexorank` パッケージ
- Jira 互換 bucket prefix と境界ケース保証

### H-5. migrator / app ロール分離 → ADR-0010 追補

```sql
CREATE ROLE migrator WITH LOGIN BYPASSRLS;
CREATE ROLE app WITH LOGIN;
```

Prisma `directUrl` に migrator、`url` に app を指定。

### H-6. E2E 用 Credentials Provider → ADR-0022

- OAuth を msw で捕捉不可(Auth.js リダイレクト仕様)
- `NODE_ENV=test` 限定で Credentials Provider 登録
- 本番バンドルで tree-shake される

## Medium 7 件(改善反映済)

### M-1. OpenAPI operation description に membership 要件明記

### M-2. Conversation/Message tenant トリガー → ADR-0019

```sql
CREATE TRIGGER conv_tenant_member BEFORE INSERT OR UPDATE ON "Conversation"
FOR EACH ROW EXECUTE FUNCTION assert_user_in_tenant();
```

### M-3. Week 3 Day 6 負荷分散

- Day 6 を CI 専念に変更
- Day 7 に logger + README + タグを移動

### M-4. ベンチマーク値は目標値と明示

- README 掲載は Week 10 以降の実測後
- CONTRIBUTING に「実測前にコピペ禁止」注記

### M-5. README トップ順序の最適化

1. Live demo URL
2. デモ GIF(5 秒で光る)
3. 技術的差別点 3 行
4. ベンチマーク実測
5. 詳細

### M-6. 2 本同時リスク制御 → ADR-0017

- Week 10 で Boardly 完全公開(応募開始ライン)
- Knowlex は Week 9 以降共通基盤再利用で並行

### M-7. CI Eval コスト制御

- PR: golden 10 問サブセット
- main push / nightly: golden 50 フル

## Low 4 件(好み、後日判断)

### L-1. プロダクト名の availability チェック

- Boardly / Knowlex が GitHub org / domain で被る場合:
  - Syncboard / Docuvec など代替案

### L-2. LICENSE 選定

- MIT(拡散性重視)
- CC-BY-NC-SA(ポートフォリオ用で再利用抑制)

### L-3. Commit message scope 統一

- CONTRIBUTING.md に `feat(collab):` `feat(auth):` など scope ルール明記

### L-4. DB インスタンス分離 → ADR-0018

- Boardly / Knowlex は Neon 別プロジェクト

## 欠落成果物 → 全て起草済(他ファイル参照)

| 成果物               | 配置先                                    | 参照 |
| -------------------- | ----------------------------------------- | ---- |
| STRIDE 脅威モデル    | `docs/security/threat-model.md`           | 09\_ |
| 障害対応 Runbook     | `docs/ops/runbook.md`                     | 09\_ |
| API レート制限表     | `docs/api/rate-limits.md`                 | 09\_ |
| データ保持ポリシー   | `docs/compliance/data-retention.md`       | 09\_ |
| プロンプトレジストリ | `apps/knowledge/src/server/ai/prompts/`   | 10\_ |
| Golden QA 50 問      | `apps/knowledge/docs/eval/golden_qa.yaml` | 10\_ |
| Eval 実行スクリプト  | `scripts/run-eval.ts`                     | 10\_ |
| 面接 Q&A 30 問       | `docs/hiring/interview-qa.md`             | 11\_ |
| ポートフォリオ LP    | `docs/hiring/portfolio-lp.md`             | 11\_ |
| デモ絵コンテ         | `docs/hiring/demo-storyboard.md`          | 11\_ |
| アーキテクチャ図     | `docs/architecture/system-overview.mmd`   | -    |
| 契約テスト           | `apps/*/tests/contract/`                  | -    |

## 追加 ADR(0016-0022)全 7 本

| #    | タイトル                       |
| ---- | ------------------------------ |
| 0016 | 無料インフラ制約と緩和策       |
| 0017 | 公開順序(Boardly 先行)         |
| 0018 | DB インスタンス分離            |
| 0019 | Conversation tenant トリガー   |
| 0020 | プロンプト Git 管理 + ハッシュ |
| 0021 | LexoRank 既存ライブラリ採用    |
| 0022 | E2E 用 Credentials Provider    |

## 最終状態

- 設計書 12 ファイル(本 memory ディレクトリ)
- ADR 22 本
- OpenAPI 2 本
- Prisma schema 2 本 + RLS migration
- 脅威モデル / Runbook / 保持ポリシー / レート制限表
- プロンプトレジストリ + Golden 50 問 + Eval スクリプト
- 面接 Q&A 30 問 + LP + デモ絵コンテ
- Week 3 日次タスク(31 commits / 7 PR)

**この状態で採用担当を唸らせる準備は完了**。次にやるのは新規 GitHub リポジトリ `craftstack` 作成 → Phase 1 monorepo 初期化 → Week 3 Day 1 から commit 積み上げ。
