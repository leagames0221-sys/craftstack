---
name: craftstack — 転職用ポートフォリオ 2 本立て (Boardly + Knowlex)
description: GitHub 代表作として Next.js 15 monorepo で作る、リアルタイム協働カンバン (Boardly) と マルチテナント AI ナレッジ SaaS (Knowlex) の設計 bible。採用面接で唸らせる最高品質ルート、全ドキュメント完成済み。
type: project
isolation: STRICT  # UE5/ZN と完全独立、相互参照禁止
updated: 2026-04-22
originSessionId: Session248
---

# 🛡️ 独立 PJ 宣言(最優先)

**本プロジェクトは UE5 ゲーム開発(ZenithNexus = ZN)とは完全に別物**。

- ZN の CLAUDE.md / BIBLE / Plan/Execute profile / hook ルール / 禁止フレーズは **craftstack に一切適用されない**
- ZN の MEMORY.md / wiki / DoR / Docs を **参照してはならない**
- ZN の Scripts / Commandlet / commit 規約は **無視する**
- ZN の「Plan AI=設計士 / Execute AI=大工」役割分離は **craftstack では適用外**
- craftstack の AI は通常の Claude Code として自由に設計・実装議論を行う

本 PJ の技術領域は **Next.js / TypeScript / Prisma / PostgreSQL / Socket.IO / pgvector / Gemini API / Vercel / Fly.io** であり、UE5 / C++ / Unreal Engine とは関係ない。

---

# 🔑 再突入方法(将来セッション用)

ユーザーが以下いずれかを発言したら、**本 README を最初に full Read** してから応答する:

## 再突入トリガー
- 「craftstack」
- 「Boardly」または「ボードリー」
- 「Knowlex」または「ノーレックス」
- 「ポートフォリオ」(GitHub 代表作の文脈)
- 「GitHub 代表作」
- 「転職用代表作」「転職活動」(Web エンジニア転職文脈)
- 「Next.js のあれ」「ナレッジSaaS」「カンバンアプリ」(本 PJ の固有技術文脈)

## 再突入時の Read 順序

1. **本 `README.md` を full Read**(本 PJ の全体像・ルール・ファイル index)
2. ユーザーの質問内容に応じて `01_` 〜 `12_` の該当ファイルを Read
3. 全体把握が必要なら番号順に 01〜12 を連続 Read

## 再突入時の禁止事項

- ZN のファイル(`C:/Users/admin/Documents/Unreal Projects/ZenithNexus/`)を Read しない
- ZN の MEMORY.md から craftstack 以外の情報を引用しない
- ZN の役割分離・BIBLE・禁止フレーズを craftstack 議論に持ち込まない

---

# 🎯 プロジェクト目的(再突入時の前提再確認)

**ユーザーは現在 Public GitHub に出せる代表作がない**。Web エンジニア転職で採用面接で「フルスタック × フルスクラッチ開発できる」ことを唸らせるため、2 プロダクト同時開発する。

## 意思決定サマリ(2026-04-22 確定)

- **2 本同時開発**: Boardly(リアルタイム協働カンバン)+ Knowlex(マルチテナント AI ナレッジ SaaS)
- **monorepo**: Turborepo + pnpm workspaces
- **Boardly を Week 10 末に先行公開**、Knowlex を Week 16 末に追走
- **完全無料運用**: Neon / Upstash / Fly.io / Vercel / R2 / Gemini Flash ですべて $0
- **最高品質ルート**: 妥協なし、MVP や縮小版の発想は持たない

## 禁止事項(本 PJ 運用ルール)

- MVP / 縮小版 / 簡易版の発想禁止(採用担当を唸らせるのが目的のため最高品質のみ)
- 有料インフラ依存禁止(完全 $0 運用)
- チュートリアル写経禁止(全機能は自己設計の成果物)

---

# 📂 ファイル構成(本ディレクトリ内)

| ファイル | 内容 | 主な参照タイミング |
|---|---|---|
| `README.md` | **本ファイル** = 本 PJ 唯一の入口 + 独立宣言 + ファイル index | 毎回最初 |
| `01_project_overview.md` | プロダクト 2 本の狙い / 無料スタック / 18 週ロードマップ / リスク制御 | 全体像質問 |
| `02_monorepo_structure.md` | Phase 1: monorepo ディレクトリ + 初期セットアップ | 実装着手時 |
| `03_boardly_design.md` | Boardly (案A) 完全版(要件 F-01〜F-20 / ER / WS / E2E) | Boardly 質問 |
| `04_knowlex_design.md` | Knowlex (案B) 完全版(要件 F-01〜F-26 / RAG / Eval) | Knowlex 質問 |
| `05_prisma_schemas.md` | 両アプリ Prisma schema + RLS + pgvector migration + migrator/app ロール分離 | DB 設計質問 |
| `06_openapi_specs.md` | 両アプリ OpenAPI YAML + 型自動生成パイプライン + `x-required-roles` | API 設計質問 |
| `07_week3_tasks.md` | Boardly Week 3 日次タスク分解(31 commits / 7 PR) | 実装着手週 |
| `08_adr_0001_0022.md` | ADR 全 22 本サマリ + 面接で語る用のキーポイント | 設計判断質問 |
| `09_threat_model_runbook.md` | STRIDE 脅威モデル + 障害対応 Runbook + Rate Limits + データ保持 | セキュリティ/運用質問 |
| `10_prompts_eval.md` | プロンプトレジストリ + Golden QA 50 問 + Eval スクリプト + CI | RAG 品質質問 |
| `11_hiring_materials.md` | 面接想定 Q&A 30 問 + ポートフォリオ LP + デモ動画絵コンテ | 面接準備時 |
| `12_critical_fixes.md` | 自己レビューで判明した Critical/High 修正パッチ(schema/OpenAPI/Socket.IO) | 実装前の注意点確認 |

---

# 🚀 次にユーザーがやること(現状)

1. 新規 Public GitHub リポジトリ `craftstack` を作成(名前は availability 次第で `Syncboard` / `Docuvec` 等に変更可)
2. 本ディレクトリの設計書を基に monorepo を初期化
3. `07_week3_tasks.md` Day 1 から commit を積み始める
4. Week 10 末に Boardly 先行公開 → 応募開始可能ライン到達
5. Week 16 末に Knowlex 公開 → 差別化完成

## 進捗記録の書き足し場所

実装開始後、進捗や意思決定更新を記録する際は:

- **Week 単位の実績** → 本ディレクトリに `13_progress_log.md` 新規作成して追記
- **新規 ADR** → `08_adr_0001_0022.md` に追記 + 本 README の ADR 本数を更新
- **設計変更** → 該当番号ファイルを直接 Edit + `12_critical_fixes.md` に変更ログ追記
- **詰まった事象 / 学び** → `14_lessons_learned.md` を新規作成

---

# 🔒 独立性の技術的保証

本 PJ は **ZN とは別の技術領域** のため、両者を同セッション内で議論しない方が安全:

| | ZenithNexus (ZN) | craftstack |
|---|---|---|
| 言語 | C++ / Python / Blueprint | TypeScript / SQL |
| FW | Unreal Engine 5.7 | Next.js 15 |
| DB | UAsset / DataTable | PostgreSQL / pgvector |
| デプロイ | — (EA 予定) | Vercel / Fly.io |
| 目的 | NC/Ymir 級 MMORPG | 転職用ポートフォリオ |
| AI 役割 | Plan / Execute 分離(厳格) | 通常の Claude Code |
| ルート | `C:/Users/admin/Documents/Unreal Projects/ZenithNexus/` | GitHub 新規リポジトリ(未作成) |

**セッション中に片方を扱っている時、他方の議論・参照は発生させない**。切替時は明示的な宣言を待つ。

---

# 📅 更新履歴

- 2026-04-22(Session 248): 本 PJ 初回制定、13 ファイル起草完了、ZN memory に pointer 追加、独立宣言明文化
