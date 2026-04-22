---
name: craftstack プロジェクト概要
type: project
---

# プロジェクト概要

## プロダクト 2 本

### 🟣 Boardly (apps/collab)
**リアルタイム協働カンバン**
- OAuth(Google/GitHub)+ 4 階層 RBAC(OWNER/ADMIN/EDITOR/VIEWER)
- WebSocket(Socket.IO + Redis Pub/Sub)同時編集 + プレゼンス + カーソル共有
- 楽観ロック(version 列) + LexoRank による並び替え
- 添付(R2)/ コメント + メンション / アクティビティログ / Web Push 通知
- 全文検索(tsvector + pg_trgm)/ Undo-Redo / オフライン対応
- 多言語(JP/EN)/ ダークモード / WAI-ARIA 準拠

### 🟠 Knowlex (apps/knowledge)
**マルチテナント AI ナレッジ検索 SaaS**
- OAuth + マルチテナント(RLS + クエリ層の二重防御)
- ドキュメント取込(PDF/MD/DOCX/URL)BullMQ 非同期パイプライン
- ハイブリッド検索(pgvector HNSW + BM25 + RRF)+ Cohere Rerank
- HyDE + Faithfulness チェック付き RAG(Gemini Flash SSE ストリーミング)
- API キー + Webhook + 監査ログ + 利用量ダッシュボード
- Eval パイプライン(Golden 50 問)CI 統合

## 完全無料スタック

| 層 | サービス | 無料枠 |
|---|---|---|
| コード | GitHub Public | 無制限 |
| CI | GitHub Actions | Public 完全無料 |
| Front/SSR | Vercel Hobby | 100GB/月 |
| 常駐 Server | Fly.io | shared-cpu-1x 3 台(クレカ登録必須) |
| DB | Neon Postgres + pgvector | 0.5GB/プロジェクト |
| Redis | Upstash | 10,000 cmd/day |
| Storage | Cloudflare R2 | 10GB egress 無料 |
| Auth | Auth.js v5 + OAuth | 無料 |
| Mail | Resend | 100/day, 3,000/月 |
| LLM | Google Gemini Flash | 1,500 req/day |
| Embedding | text-embedding-004 | 無料枠あり |
| Rerank | Cohere trial | 1000/月 |
| Error | Sentry | 5,000 event/月 |
| Log | Better Stack | 1GB/月 |
| Uptime | UptimeRobot | 50 monitor |
| Drive | `*.vercel.app` / `*.fly.dev` 無料サブドメイン |

**月額**: ¥0。保険で API に $5 チャージ可能(任意)。

## 実装ロードマップ(18 週)

| 週 | 内容 |
|---|---|
| Week 1-2 | Phase 1: monorepo 基盤 + CI + Docker Compose |
| Week 3-8 | Boardly 実装(8 週) |
| Week 9 | Boardly 多言語 / a11y / ダークモード / Load test |
| Week 10 | **Boardly 公開**(デプロイ + README + デモ動画)← 応募可能ライン |
| Week 9-14 | Knowlex 実装(並行 6 週、Week 9 から共通基盤再利用) |
| Week 15 | Knowlex API キー / Webhook / 多言語 / a11y / Load |
| Week 16 | **Knowlex 公開** |
| Week 17-18 | 両アプリ README 最終磨き + ポートフォリオ LP + 面接準備 |

## リスク制御(ADR-0017)

- 最悪でも Week 10 で「完成した 1 本」がある
- Boardly を先に世に出す = 応募活動を並走開始可能
- Knowlex は Week 9 以降、共通基盤(認証・UI・DB 設定)を再利用

## 採用担当を唸らせるポイント

- **設計ドキュメント 22 ADR + ER 図 + OpenAPI + 脅威モデル + Runbook** 完備
- **テスト全層**: Unit / Integration / API / Contract / WebSocket / E2E / A11y / Load / Eval
- **実測ベンチマーク**: p95 / TTFT / Context Precision を README に掲載
- **プロンプト Git 管理 + ハッシュ記録**(AI 品質改善の追跡可能性)
- **無料インフラ × 本番品質**(発想力と実装力の両立)
- **設計 → 実装 → 運用 → 改善ループ** の一貫経験
