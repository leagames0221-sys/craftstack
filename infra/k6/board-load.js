// @ts-check
//
// === STATUS: design-phase scaffold, not currently runnable against production ===
//
// This script was written for the original ADR-0009 architecture (Vercel +
// Fly.io with a self-hosted Socket.IO server on `ws://.../boards`). The
// implementation pivoted to Pusher Channels during Boardly v0.1.0 (see
// ADR-0052) — Boardly no longer exposes a WebSocket endpoint to load-test.
// Pusher Sandbox itself is rate-limited per ADR-0046 free-tier stance, so
// hammering it from k6 against the live deploy would be self-inflicted DoS.
//
// Kept as scaffold so the k6 toolchain entry remains in the repo; a
// rewritten Pusher-aware load harness (HTTP-fanout latency + connection
// limits) is on the v0.6.0 roadmap. Do NOT run this file as-is against
// craftstack-collab.vercel.app — it will fail at the `ws.connect()` call.
//
// Run (against a future Pusher-aware rewrite):
//   k6 run -e BASE_URL=... infra/k6/board-load.js

import { check } from 'k6'
import ws from 'k6/ws'

export const options = {
  scenarios: {
    sustained: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '1m', target: 200 },
        { duration: '2m', target: 200 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    ws_connecting: ['p(95) < 2000'],
    ws_session_duration: ['p(95) < 180000'],
    checks: ['rate > 0.99'],
  },
}

const BASE_URL = __ENV.BASE_URL ?? 'ws://localhost:3000'
const BOARD_IDS = [
  // Seed these from the seed script before running against a staging DB.
  'seed-board-demo',
]

export default function () {
  const boardId = BOARD_IDS[__VU % BOARD_IDS.length]
  const url = `${BASE_URL}/boards?board=${boardId}`

  const res = ws.connect(url, null, (socket) => {
    socket.on('open', () => {
      socket.send(JSON.stringify({ event: 'board:join', boardId }))
    })

    socket.on('message', (msg) => {
      const parsed = JSON.parse(msg)
      check(parsed, {
        'event is a known type': (p) =>
          ['board:snapshot', 'presence:update', 'board:updated'].includes(
            p.event,
          ),
      })
    })

    socket.setInterval(() => {
      socket.send(JSON.stringify({ event: 'presence:heartbeat' }))
    }, 60_000)

    socket.setTimeout(() => socket.close(), 120_000)
  })

  check(res, { 'ws handshake accepted': (r) => r && r.status === 101 })
}
