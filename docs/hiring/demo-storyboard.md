# Demo video storyboards

> ⚠️ **Design-phase aspirational storyboards** — the shots below describe the _eventual_ demo-video target (multi-tenant isolation, file upload, API key issuance, eval-dashboard numbers, etc.). The **actual recorded Loom demos** are the two short walkthroughs linked from the main [README](../../README.md): Boardly 45 s and Knowlex 33 s. Any shot on this page that references multi-tenant switches, PDF ingest, or an API-key terminal is not in the shipped MVP — see [ADR-0039](../adr/0039-knowlex-mvp-scope.md) for the scope decision.

Two 45-second screen captures. Intended to load fast enough for a recruiter to watch both in under 2 minutes.

## Boardly (90 s)

| Time        | Shot                                                                                |
| ----------- | ----------------------------------------------------------------------------------- |
| 0:00窶・:05 | Title card: "Boardly ﾂｷ Realtime Kanban" with the indigo-to-violet gradient logo    |
| 0:05窶・:15 | Sign-in page 竊・Google OAuth 竊・arrive on an empty dashboard                      |
| 0:15窶・:30 | Create a workspace, then create three lists and five cards (sped up 2ﾃ・            |
| 0:30窶・:45 | Screen splits into two browsers, both viewing the same board                        |
| 0:45窶・:55 | Drag a card on the left 竊・instantly moves on the right; presence avatars light up |
| 0:55窶・:05 | Both browsers edit the same card title; one gets a 409, sees a merge toast          |
| 1:05窶・:15 | Switch to a Viewer account in the right browser: edit controls become disabled      |
| 1:15窶・:25 | Search bar: Japanese query hits an English card via `pg_trgm` trigram fallback      |
| 1:25窶・:30 | End card: stack pill row (Next.js ﾂｷ Socket.IO ﾂｷ Redis ﾂｷ Prisma)                  |

## Knowlex (90 s)

| Time        | Shot                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| 0:00窶・:05 | Title card: "Knowlex ﾂｷ AI Knowledge SaaS"                                                            |
| 0:05窶・:15 | Drag-and-drop a PDF 竊・ingestion progress SSE 竊・Ready status                                       |
| 0:15窶・:35 | Type a business question 竊・streaming answer appears token by token with inline citation chips       |
| 0:35窶・:45 | Click a citation 竊・source PDF preview slides in with the cited passage highlighted                  |
| 0:45窶・:55 | Thumbs-up feedback 竊・Usage dashboard counter ticks                                                  |
| 0:55窶・:10 | Issue an API key 竊・curl command in a separate terminal gets the same answer                         |
| 1:10窶・:20 | Sign in as a different tenant 竊・no documents are visible; explicit "multi-tenant isolation" caption |
| 1:20窶・:30 | Eval dashboard: Context Precision 0.89, Faithfulness 0.92                                             |

## Capture setup

- 1080p 30 fps, burned-in subtitles in English (Japanese subtitle track optional)
- OBS Studio or Loom; audio narration optional 窶・subtitles must carry the story alone
- First 5 seconds must show something visibly moving; recruiters scan quickly
- Host on Loom or YouTube unlisted; link from README
