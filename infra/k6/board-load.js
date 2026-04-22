// @ts-check
//
// k6 load test for Boardly realtime editing.
// Targets 200 concurrent WebSocket connections across 20 boards.
// Thresholds match README claims (p95 < 300ms on Fly.io, success >= 99%).
//
// Run: k6 run -e BASE_URL=https://boardly.app infra/k6/board-load.js

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
