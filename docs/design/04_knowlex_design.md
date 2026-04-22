---
name: Phase 3 - Knowlex 設計完全版
type: project
---

# Phase 3: Knowlex (apps/knowledge) 完全版設計

## プロダクト概要
組織ドキュメント(PDF/MD/DOCX/URL)を取り込み、自然言語質問に**根拠付きで回答**するマルチテナント AI ナレッジ SaaS。実業務で使える品質で構築。

## 機能要件(F-01〜F-26 全実装)

| ID | 機能 |
|---|---|
| F-01 | OAuth(Google/GitHub) |
| F-02 | マルチテナント(RLS + クエリ層二重防御) |
| F-03 | 招待 + 4 階層 RBAC |
| F-04 | ドキュメント取込(PDF/MD/DOCX/TEXT/URL/HTML) |
| F-05 | BullMQ 非同期取込 + SSE 進捗 + リトライ |
| F-06 | 意味単位チャンキング(境界尊重 + オーバーラップ) |
| F-07 | 埋め込み生成(Gemini text-embedding-004 + ローカル fallback) |
| F-08 | ベクトル検索(pgvector HNSW) + BM25 ハイブリッド |
| F-09 | リランキング(Cohere rerank + cross-encoder fallback) |
| F-10 | RAG 応答(Gemini Flash SSE ストリーミング + 引用) |
| F-11 | 会話履歴 + タイトル自動生成 + ピン留め |
| F-12 | 引用 UI(該当チャンクへジャンプ + 原文プレビュー) |
| F-13 | フィードバック(thumbs + 理由) |
| F-14 | フォルダ階層 + タグ + バージョン + 論理削除/復元 |
| F-15 | 権限(Tenant 共有/フォルダ共有/個人専有) |
| F-16 | 全文検索(tsvector + pg_trgm) |
| F-17 | 利用量 Dashboard(ユーザー/テナント別、コスト可視化) |
| F-18 | レート制限(tenant + user 二重) |
| F-19 | 監査ログ(全取込/検索/回答/共有) |
| F-20 | Webhook(取込完了、評価) |
| F-21 | API トークン発行(scopes 制限) |
| F-22 | エクスポート(会話 JSON、原本 zip) |
| F-23 | Web Push + メール通知 |
| F-24 | 多言語(JP/EN) |
| F-25 | ダークモード |
| F-26 | WAI-ARIA 準拠 |

## 品質装置(差別化)

- ハイブリッド検索 + Reciprocal Rank Fusion
- Rerank で Context Precision 0.62 → 0.89(目標)
- HyDE(仮想回答埋め込み)
- Faithfulness チェック(各文 vs 引用チャンクの含意)
- SSE ストリーミング(TTFT p95 < 1.2s)
- プロンプトレジストリ(Git 管理 + SHA256 記録)
- Eval パイプライン(Golden 50 問、CI 統合)
- 埋め込みキャッシュ(Redis)
- コスト可視化(token / model / USD)

## ER 図サマリ(詳細は 05_prisma_schemas.md)

エンティティ:
- User, Account, Session, VerificationToken
- Tenant, TenantMember, TenantInvitation
- Folder, Document, DocumentVersion, Chunk, Embedding(分離)
- Conversation, Message, Citation, Feedback
- ApiKey, Webhook, AuditLog, Usage
- Notification, NotificationSubscription

設計勘所:
- Embedding を別テーブル → モデル差し替え時 Chunk 保持
- DocumentVersion で再取込履歴
- Citation.chunkId で RAG 根拠永続化
- RLS 全テーブル(Tenant 本体を除く)
- pgvector HNSW(m=16, ef_construction=200)

## RAG パイプライン

### Ingestion(取込)
1. Upload → presigned PUT → Cloudflare R2
2. BullMQ "ingest" queue enqueue
3. Worker(Fly.io dedicated):
   - Download from R2
   - Extract text(pdf-parse / mammoth / marked / cheerio)
   - Structure(headings / sections / tables)
   - Chunk(600 tokens、80 overlap、境界尊重)
   - tsvector 生成
   - Batch embed via Gemini(100 chunk ずつ)
   - INSERT Chunk + Embedding(transaction)
   - status = READY
   - Webhook + notification

### Query(検索/回答)
1. Query Rewrite(過去会話考慮、Gemini)
2. HyDE(仮想回答生成 → 埋め込み)
3. Hybrid Retrieve:
   - Vector: pgvector top 50
   - BM25: tsvector ts_rank top 50
   - Fusion: RRF → top 20
4. Rerank(Cohere rerank-multilingual-v3 top 5)
5. Context Build(`<|cite:xxx|>` 付与)
6. Generate(Gemini Flash SSE)
7. Parse Citations(応答から <|cite:xxx|> 抽出 → Citation 保存)
8. Faithfulness Check(各文 vs 引用、Gemini ゼロショット NLI)
9. Persist(Message + Citation + Usage + AuditLog)

## 主要パラメータ

| 項目 | 値 |
|---|---|
| Chunk size | 600 tokens |
| Overlap | 80 tokens |
| Embedding model | text-embedding-004(768 次元) |
| Vector index | HNSW(m=16, ef=200) |
| Retrieve top-k | 50 + 50 → 融合 20 |
| Rerank top-k | 5 |
| Generation model | gemini-2.0-flash |
| Context window | 8000 tokens |

## 非機能要件

- 検索 p95 < 800ms(retrieval + rerank)
- TTFT p95 < 1.2s
- 100 ページ PDF 取込 < 60s
- 1 テナント 50 クライアント、1 インスタンス 300 接続
- 稼働率 99.5%

## マルチテナント分離(三重防御)

1. **API 層**: middleware で slug → tenantId 解決、Prisma 全クエリに tenantId 必須
2. **DB 層**: RLS(`SET LOCAL app.tenant_id`)
3. **Worker 層**: BullMQ ジョブに tenantId 必須、取出し時検証

## 権限マトリクス

| 操作 | OWNER | ADMIN | EDITOR | VIEWER |
|---|:-:|:-:|:-:|:-:|
| テナント削除 | ✓ | | | |
| メンバー招待/ロール変更 | ✓ | ✓ | | |
| ドキュメント取込 | ✓ | ✓ | ✓ | |
| ドキュメント削除 | ✓ | ✓ | ✓ | |
| チャット/検索 | ✓ | ✓ | ✓ | ✓ |
| フィードバック | ✓ | ✓ | ✓ | ✓ |
| API キー発行 | ✓ | ✓ | | |
| 監査ログ閲覧 | ✓ | ✓ | | |

## REST API(主要のみ、詳細は 06_openapi_specs.md)

- auth / tenants / members / invitations
- folders / documents(upload-presign / upload-confirm / url-ingest / text-ingest)
- search(hybrid/vector/keyword)
- conversations / messages(SSE) / citations / feedback
- api-keys / webhooks
- usage / audit / export

## Eval 指標(Golden 50 問、CI しきい値)

| 指標 | しきい値 |
|---|---|
| Context Precision | ≥ 0.80 |
| Context Recall | ≥ 0.75 |
| Faithfulness | ≥ 0.85 |
| Answer Relevance | ≥ 0.80 |
| Latency p95 | ≤ 1500ms |

## セキュリティ

- RLS + クエリ層 + Worker 層の三重防御
- プロンプトインジェクション対策(System/User/Document タグ分離、`<document>` 埋込)
- PII マスキング(取込時オプション)
- API キー Argon2 ハッシュ + scopes 制限
- Webhook HMAC-SHA256 署名(受信側検証要求)
- レート制限(tenant + user + endpoint 三重)
- ファイル検証(MIME + 拡張子 + magic bytes)
- Dependabot / Renovate / pnpm audit

## テスト

| レイヤ | ツール | 目標 |
|---|---|---|
| Unit | Vitest | 90% |
| Integration | Vitest + Testcontainers | 80% |
| Pipeline | Vitest | 90% |
| API | Vitest + supertest | 全 endpoint |
| Contract | Vitest + openapi-typescript | 全 endpoint |
| E2E | Playwright | 10 シナリオ |
| A11y | axe-core | violation 0 |
| Load | k6 | 30 同時 RAG 99% |
| Eval | 自作 + Ragas 相当 | しきい値固定 CI block |

## E2E 必達 10 シナリオ

1. OAuth → テナント作成
2. 招待 → 別ユーザー受諾
3. PDF upload → 取込完了通知
4. URL 取込(クローリング)
5. RAG 質問 → SSE + 引用ジャンプ
6. フィードバック → Usage 反映
7. Viewer ロール取込ボタン disabled
8. ハイブリッド検索(日本語+英語)
9. API キー発行 → 外部 curl 呼び出し成功
10. 監査ログ表示 + エクスポート

## 実装マイルストーン(Week 9-16、8 週)

| 週 | DoD |
|---|---|
| Week 9 | Prisma + RLS + pgvector + Auth.js + テナント作成 |
| Week 10 | 招待 + RBAC + フォルダ CRUD + 権限テスト緑 |
| Week 11 | 取込 Pipeline(PDF/MD/DOCX)+ BullMQ + SSE 進捗 + R2 |
| Week 12 | Chunker + Gemini embedding + pgvector HNSW + ingest 完走 |
| Week 13 | ハイブリッド検索(Vector+BM25+RRF) + Cohere rerank + 検索 UI |
| Week 14 | RAG 生成 + SSE + 引用 UI + 会話履歴 + Faithfulness check |
| Week 15 | API キー + Webhook + 多言語 + ダークモード + a11y + Load test |
| Week 16 | Fly/Vercel デプロイ + 監視 + README + デモ動画 + Eval レポート + 公開 |

## 公開 URL(予定)
- https://knowlex.app または https://knowlex.fly.dev
