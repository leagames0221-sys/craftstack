import { ImageResponse } from "next/og";

/**
 * Dynamic Open Graph image for the landing page. Next generates a real PNG
 * at request time via ImageResponse, so the URL sharing preview in Slack /
 * Twitter / LinkedIn looks intentional instead of defaulting to a blank
 * browser favicon. System fonts only — no external CDN fetch, so it stays
 * inside the strict CSP we set on the app.
 */
export const runtime = "edge";
export const alt = "craftstack — two SaaS apps built from schema to deploy";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background:
          "linear-gradient(135deg, #0a0a0a 0%, #0f0a1e 40%, #0a1015 100%)",
        padding: "64px 80px",
        color: "#f5f5f5",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background:
              "linear-gradient(135deg, #6366f1, #8b5cf6 50%, #06b6d4)",
          }}
        />
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: -0.5,
          }}
        >
          craftstack
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: -2,
            lineHeight: 1.05,
            maxWidth: 980,
          }}
        >
          Two SaaS apps, built from schema to deploy.
        </div>
        <div
          style={{
            fontSize: 26,
            color: "#a3a3a3",
            fontWeight: 400,
            maxWidth: 920,
          }}
        >
          Boardly — realtime kanban · Knowlex — streaming AI knowledge
          retrieval. One Turborepo, $0/month.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {[
          "Next.js 16",
          "Prisma 7",
          "Auth.js v5",
          "pgvector HNSW",
          "Gemini Flash",
          "Pusher",
          "A Security",
          "276 tests",
        ].map((t) => (
          <div
            key={t}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: "1px solid #262626",
              background: "#141414",
              color: "#d4d4d4",
              fontSize: 20,
              display: "flex",
            }}
          >
            {t}
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}
