# Demo video storyboards

Two 90-second screen captures. Intended to load fast enough for a recruiter to watch both in under 3 minutes.

## Boardly (90 s)

| Time      | Shot                                                                              |
| --------- | --------------------------------------------------------------------------------- |
| 0:00–0:05 | Title card: "Boardly · Realtime Kanban" with the indigo-to-violet gradient logo   |
| 0:05–0:15 | Sign-in page → Google OAuth → arrive on an empty dashboard                        |
| 0:15–0:30 | Create a workspace, then create three lists and five cards (sped up 2×)           |
| 0:30–0:45 | Screen splits into two browsers, both viewing the same board                      |
| 0:45–0:55 | Drag a card on the left → instantly moves on the right; presence avatars light up |
| 0:55–1:05 | Both browsers edit the same card title; one gets a 409, sees a merge toast        |
| 1:05–1:15 | Switch to a Viewer account in the right browser: edit controls become disabled    |
| 1:15–1:25 | Search bar: Japanese query hits an English card via `pg_trgm` trigram fallback    |
| 1:25–1:30 | End card: stack pill row (Next.js · Socket.IO · Redis · Prisma)                   |

## Knowlex (90 s)

| Time      | Shot                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------- |
| 0:00–0:05 | Title card: "Knowlex · AI Knowledge SaaS"                                                           |
| 0:05–0:15 | Drag-and-drop a PDF → ingestion progress SSE → Ready status                                         |
| 0:15–0:35 | Type a business question → streaming answer appears token by token with inline citation chips       |
| 0:35–0:45 | Click a citation → source PDF preview slides in with the cited passage highlighted                  |
| 0:45–0:55 | Thumbs-up feedback → Usage dashboard counter ticks                                                  |
| 0:55–1:10 | Issue an API key → curl command in a separate terminal gets the same answer                         |
| 1:10–1:20 | Sign in as a different tenant → no documents are visible; explicit "multi-tenant isolation" caption |
| 1:20–1:30 | Eval dashboard: Context Precision 0.89, Faithfulness 0.92                                           |

## Capture setup

- 1080p 30 fps, burned-in subtitles in English (Japanese subtitle track optional)
- OBS Studio or Loom; audio narration optional — subtitles must carry the story alone
- First 5 seconds must show something visibly moving; recruiters scan quickly
- Host on Loom or YouTube unlisted; link from README
