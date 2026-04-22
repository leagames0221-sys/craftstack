---
name: Phase 6 - Boardly Week 3 日次タスク分解
type: project
---

# Phase 6(α): Boardly Week 3 日次タスク分解

**Week 3 目標**: Prisma 全テーブル + Auth.js + ログイン→ダッシュボード表示 を公開可能な粒度で完了。

- 1 日 2〜4 commit、18〜22 commit / 5〜7 PR
- Day 7 終わりに main へマージ
- 公開リポジトリで草(contribution graph)を毎日点灯

## Day 1(月)Prisma セットアップ & User/Workspace

**PR #1: feat(collab): prisma setup with core tables**
1. `chore(collab): init prisma with postgres + pg_trgm`
2. `feat(collab): add User, Account, Session, VerificationToken`
3. `feat(collab): add Workspace, Membership, Invitation`
4. `chore(collab): run initial migration and generate client`

検証: `prisma migrate status` up-to-date / packages/db から import / Docker Postgres 疎通

## Day 2(火)Kanban + Label/Attachment/Activity

**PR #2: feat(collab): add kanban domain tables**
5. `feat(collab): add Board, List, Card with LexoRank position`
6. `feat(collab): add Label, CardLabel, CardAssignee`
7. `feat(collab): add Comment, Mention, Attachment`
8. `feat(collab): add ActivityLog, Notification, NotificationSubscription`
9. `feat(collab): migration for tsvector + GIN + pg_trgm indexes`

検証: `\d Card` で search_vector 確認 / GIN index 存在 / onDelete=SetNull 反映

## Day 3(水)Seed + db パッケージ

**PR #3: feat(db): prisma client singleton + seed script**
10. `feat(db): prisma client singleton with query logging`
11. `feat(db): seed script for collab demo data`
12. `test(db): unit test for LexoRank helper (library wrapper)`
13. `docs: ADR 0002 prisma as ORM`

検証: `pnpm db:seed` 成功 / Prisma Studio で全テーブル 1 件 / LexoRank 緑

## Day 4(木)Auth.js(Google + GitHub)

**PR #4: feat(collab): oauth authentication with auth.js**
14. `feat(auth): auth.js v5 config with prisma adapter (database session)`
15. `feat(collab): google and github oauth providers`
16. `feat(collab): signin page with brand buttons`
17. `feat(collab): middleware for protected routes`
18. `test(collab): e2e signin flow with test credentials provider` (ADR-0022)

検証: Google/GitHub 両方でログイン→/dashboard / 未ログイン /dashboard→signin / Account テーブル INSERT

## Day 5(金)RBAC + ダッシュボード

**PR #5: feat(collab): rbac helper + dashboard**
19. `feat(auth): rbac helper with role hierarchy (hasRole, requireRole)`
20. `test(auth): rbac helper exhaustive matrix tests (16 patterns)`
21. `feat(collab): GET /api/workspaces returns my memberships`
22. `feat(collab): dashboard page with workspace grid`

検証: Seed user でダッシュボードに demo workspace 表示 / RBAC 16 パターン緑 / Lighthouse ≥ 90

## Day 6(土)CI 緑化(ロガーは Day 7 に分離)

**PR #6: chore: ci pipeline**
23. `ci: github actions with lint/typecheck/test/build matrix`
24. `ci: prisma validate and openapi lint steps`
25. `ci: dependabot + renovate config`

検証: 全ジョブ緑 / pnpm lint/typecheck/test ルート緑

## Day 7(日)logger + README + タグ

**PR #7: docs/observability: logger scaffold + week 3 milestone**
26. `feat(logger): pino + pretty (dev) / json (prod)`
27. `chore: sentry placeholder with noop in dev`
28. `docs: root readme with architecture and stack badges`
29. `docs: collab readme with screenshots`
30. `docs: ADR 0003 auth.js v5 with database session`
31. `chore: week-3 milestone tag v0.3.0`

最終: 全 PR マージ、main で `pnpm dev:collab` 動作確認、GitHub Release v0.3.0 発行

## PR/Commit サマリ

| PR | タイトル | Commits |
|---|---|---|
| #1 | prisma setup with core tables | 4 |
| #2 | add kanban domain tables | 5 |
| #3 | prisma client singleton + seed script | 4 |
| #4 | oauth authentication with auth.js | 5 |
| #5 | rbac helper + dashboard | 4 |
| #6 | ci pipeline | 3 |
| #7 | logger scaffold + week 3 milestone | 6 |
| **合計** | **7 PR** | **31 commits** |

## バッファ(詰まった時の送り先)

1. Day 6 Sentry placeholder → Week 4 観測強化に統合
2. Day 5 Lighthouse 計測 → Week 10 最終チューニングに送る
3. Day 7 ADR 0003 → Week 8 の ADR まとめ週に送る

## Week 3 終了時の外部可視状態

- 公開 GitHub リポジトリ(Public)
- `v0.3.0` タグ + Release ノート
- 草が連続 7 日点灯
- `pnpm install && docker compose up && pnpm dev:collab` でログイン画面まで到達可能
- CI バッジ緑
- MIT LICENSE

## Week 4 以降の週次ゴール(参考)

| 週 | ゴール |
|---|---|
| Week 4 | WS CRUD + RBAC + 招待メール |
| Week 5 | Board/List/Card + LexoRank + 楽観ロック + Label + Assignee |
| Week 6 | Socket.IO + Redis + snapshot + プレゼンス + カーソル |
| Week 7 | Comment + Mention + Web Push + メール + Attachment + 検索 |
| Week 8 | Activity + 監査 Dashboard + Undo/Redo + オフライン + Export |
| Week 9 | 多言語 + ダークモード + a11y + Visual Regression + k6 Load |
| Week 10 | Fly/Vercel デプロイ + 観測 + README + デモ動画 + 公開 |
