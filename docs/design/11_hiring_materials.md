---
name: 面接/採用向け成果物(Q&A + LP + デモ絵コンテ)
type: project
---

> ⚠️ **設計フェーズ文書 (2026-04-22)** — current reality に整合した hiring materials は [`docs/hiring/portfolio-lp.md`](../hiring/portfolio-lp.md) と [`docs/hiring/interview-qa.md`](../hiring/interview-qa.md) を参照 (Pusher / 単一テナント、その他具体数値は authoritative docs と README badges を一次ソースに)。当ファイルは設計時点の draft で、上記 hiring docs が authoritative。具体数値は本 banner に書かない (drift 防止 — README / portfolio-lp 更新時にここを書き換える運用は人手依存で fragile)。

# 採用担当向け資産

## 1. 面接想定 Q&A(`docs/hiring/interview-qa.md`)代表 10 問

### 技術深掘り

**Q1. なぜ monorepo?別リポ運用との比較は?**
A: 認証/UI/型を両アプリで再利用する前提で、別リポだと npm 公開 or git submodule が必要で開発往復コストが大きい。Turborepo のキャッシュで CI 時間短縮も得られる。代償はルート設定の学習コストと Vercel/Fly のビルド対象指定要件。

**Q2. 楽観ロックと悲観ロック、なぜ前者?**
A: WebSocket 切断タイミングが予測困難で、悲観ロックは解放漏れリスクが高い。楽観ロックは 409 応答とマージ UI の手間はあるが、UX が阻害されず衝突頻度を 409 率で可観測化できる。

**Q3. RLS + ORM の二重防御は冗長?**
A: ORM 層バグが tenant cross-access に直結するため、DB 層で必ず止めたい。RLS はマイグレーションで schema 一体管理でき、E2E で cross-tenant=0 件を証明できるのが大きい。

**Q4. ハイブリッド検索の RRF を選んだ理由?**
A: CombSUM はスコアスケール正規化が必要で不安定だが、RRF は順位のみで融合するため実装も検証もシンプル。50 問 golden で Vector 単独 0.62 → Hybrid+RRF 0.78 → Rerank 追加 0.89 と段階的改善を実証。

**Q5. スケールの限界は?**
A: Fly.io shared-cpu-1x × Upstash 無料で 200 同時 WebSocket 接続が上限。超過時は (1) Fly dedicated-cpu、(2) Upstash 従量、(3) Neon compute scale up の 3 段で拡張可能。k6 で 200 接続成功率 99.4% を実測済。

**Q6. RAG の幻覚対策は?**
A: Faithfulness チェックを導入。応答を文単位に分解し、各文と引用チャンクの含意を Gemini Flash ゼロショットで判定、閾値以下は「未検証」マークで UI 可視化。CI Eval でも Faithfulness しきい値 0.85 を割るとマージブロック。

### 設計判断

**Q7. 最も悩んだ設計判断は?**
A: LexoRank と整数 position の選定。実装学習コストは LexoRank が高いが、整数方式は並び替えで周辺レコード更新が必要でリアルタイム競合が増える。リアルタイム性優先のため LexoRank 採用、rank 伸長対策に月次 rebalance ジョブを用意。

**Q8. やり直せるなら何を変える?**
A: プロンプトレジストリを最初から運用していれば Eval 改善の試行錯誤が追跡しやすかった。Week 14 で導入したため、それ以前の実験履歴は Git log からの再構成になった。

### 運用・監視

**Q9. 障害対応の経験は?**
A: Neon 自動停止で月曜朝のアクセスが 500 になる事象を経験。UptimeRobot で検知、4 分毎 ping で予防する Runbook を確立。Read-only モード(Redis セッションから閲覧のみ許可)も fallback として実装。

**Q10. テスト戦略で特に意識したこと?**
A: E2E と Contract Test を峻別。E2E はユーザーストーリーを通す 10 シナリオに絞り、API 全エンドポイントは Contract Test(OpenAPI schema vs 実装)で網羅。Eval もテストの一種と位置付け、AI の品質退行を PR 時点で検知する。

### 補足:30 問フルセットのカテゴリ

1. アーキテクチャ(5 問)
2. データモデリング(4 問)
3. 認証・認可(3 問)
4. リアルタイム通信(3 問)
5. RAG / AI(4 問)
6. パフォーマンス(3 問)
7. セキュリティ(3 問)
8. テスト戦略(2 問)
9. 運用・監視(2 問)
10. プロセス(1 問)

## 2. ポートフォリオ LP(`docs/hiring/portfolio-lp.md`)

```markdown
# Hi, I'm <Name> — Full-stack engineer who ships

I build end-to-end web products from schema to deploy, solo.
This portfolio is two production-grade SaaS apps I designed and shipped.

---

## 🟣 Boardly — Realtime collaborative kanban

- OAuth(Google/GitHub)+ 4-tier RBAC + invitation email
- WebSocket realtime editing + presence + cursor sync
- Optimistic locking × LexoRank で並び替え O(1)
- k6 による 200 接続負荷試験 成功率 99.4%

**Stack:** Next.js 15 · Socket.IO · Redis Pub/Sub · Prisma · PostgreSQL · Cloudflare R2 · Fly.io · Vercel

[Live](https://boardly.app) · [Code](https://github.com/.../boardly) · [Demo 90s](...)

---

## 🟠 Knowlex — Single-tenant RAG demo(多租户は次アーク)

> ⚠️ **Design-phase aspirational copy** — 以下は設計フェーズで書いた目標値。**shipped MVP** は [ADR-0039](../adr/0039-knowlex-mvp-scope.md) で scope down 済(single-tenant / 段落 aware chunking / pgvector HNSW cosine kNN / streamed Gemini 2.0 Flash + numbered citations)。測定済の数値と現状は [main README](../../README.md) と [`docs/eval/README.md`](../eval/README.md) を参照。

Target state(design-phase ADRs 0011-0015、未 ship):

- RLS + クエリ層の二重防御で tenant 分離
- Hybrid 検索(pgvector + BM25 + RRF) + Cohere Rerank で Context Precision 0.89
- HyDE / Faithfulness チェックで幻覚抑制
- 50 golden QA Eval パイプラインを CI 統合

**Stack:** Next.js 15 · Gemini API · pgvector · BullMQ · Prisma · Fly.io · Vercel

[Live](https://craftstack-knowledge.vercel.app) · [Code](https://github.com/leagames0221-sys/craftstack/tree/main/apps/knowledge) · [Demo 33s](https://www.loom.com/share/acff991e3da94d5aa4e98dcee0b100e2) · [ADR-0039](../adr/0039-knowlex-mvp-scope.md)

---

## What I bring

- **設計から運用まで単独完遂**: ER / API / ADR 22 本 / Eval / Runbook 完備
- **品質装置を最初から**: CI で lint / test / Contract / Eval / A11y / Load すべて緑
- **ゼロ円運用の制約設計力**: 無料枠で本番品質を届ける発想と実装

---

## Contact

Email / GitHub / Resume(EN/JA)
```

英語版は `docs/hiring/portfolio-lp.en.md` に並置。

## 3. デモ動画絵コンテ(`docs/hiring/demo-storyboard.md`)

### Boardly 90 秒

```
0:00-0:05  タイトル「Boardly - Realtime Kanban」+ ロゴ
0:05-0:15  ログイン画面 → Google OAuth → ダッシュボード
0:15-0:30  ボード作成 → リスト 3 本 → カード 5 枚作成(早送り)
0:30-0:45  画面分割:左右 2 ブラウザで同じボード
0:45-0:55  片方でカード DnD → もう一方に即反映
0:55-1:05  両方で同時編集 → 楽観ロック 409 → マージ UI
1:05-1:15  Viewer でアクセス → 編集ボタン disabled
1:15-1:25  検索で日本語+英語カード横断ヒット
1:25-1:30  エンドカード「Next.js · Socket.IO · Redis · Prisma」
```

### Knowlex 90 秒

```
0:00-0:05  タイトル「Knowlex - AI Knowledge」
0:05-0:15  PDF drag&drop → 進捗 SSE → Ready
0:15-0:35  質問「業務委託契約の解除通知期間は?」→ SSE ストリーミング回答
0:35-0:45  引用ハイライトクリック → 原文プレビュー
0:45-0:55  フィードバック👍 → Usage 反映
0:55-1:10  API キー発行 → curl で外部 chat 呼び出し
1:10-1:20  別テナントでログイン → 他テナント文書が見えない
1:20-1:30  Eval ダッシュボード Context Precision 0.89
```

### 録画環境

- OBS Studio / Loom / ScreenStudio のいずれか
- 1080p 30fps 以上、字幕(英日)焼付
- 冒頭 5 秒で「何が動くか」が分かる構成

## 4. 採用担当が唸るチェックリスト

- [ ] README トップで Live demo が 5 秒で触れる
- [ ] デモ動画 90 秒版が埋め込まれている
- [ ] 技術バッジ(言語 + FW + DB + infra + 監視 + test)
- [ ] アーキテクチャ図(Mermaid、GitHub で即表示)
- [ ] ADR 22 本で判断理由明文化
- [ ] ER 図 Mermaid
- [ ] OpenAPI 仕様書 + Swagger UI / Redoc
- [ ] テスト全種揃い(E2E / Unit / Integration / Contract / A11y / Load / Eval)
- [ ] CI バッジ緑、カバレッジバッジ
- [ ] 実測ベンチマーク(p95 / TTFT / Precision)数字掲載
- [ ] 脅威モデル + Runbook
- [ ] プロンプト Git 管理 + ハッシュ記録
- [ ] 面接 Q&A 30 問即答可能
- [ ] ポートフォリオ LP(英日両言語)
- [ ] Commit conventional、PR 機能単位
- [ ] LICENSE / CONTRIBUTING / CODE_OF_CONDUCT
- [ ] Dependabot / Renovate 有効
- [ ] OGP / favicon / sitemap / robots.txt
