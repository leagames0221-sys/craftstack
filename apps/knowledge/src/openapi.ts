/**
 * OpenAPI 3.1 specification for the Knowlex REST surface.
 *
 * Hand-written rather than auto-generated so the spec *is* the
 * contract; the route handlers in `src/app/api/**` implement it. When
 * they drift, the spec is authoritative.
 *
 * Served as JSON at `GET /api/openapi.json` (public, cached),
 * browsable at `/docs/api` (same lightweight operation table that
 * apps/collab uses). Point Swagger Editor or Scalar at the JSON URL
 * to get a third-party render:
 *
 *   https://editor.swagger.io/?url=https://craftstack-knowledge.vercel.app/api/openapi.json
 */
export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Knowlex API",
    version: "0.4.0",
    description:
      "Knowlex is the retrieval-augmented generation half of craftstack. Paste text to `/api/kb/ingest`, ask questions at `/api/kb/ask`, inspect corpus health at `/api/kb/stats`. All endpoints are public (the MVP is tenantless per ADR-0039); both write endpoints are guarded by per-IP and per-container rate limits (ADR-0043).",
    license: { name: "MIT", identifier: "MIT" },
    contact: {
      name: "craftstack",
      url: "https://github.com/leagames0221-sys/craftstack",
    },
  },
  servers: [
    {
      url: "https://craftstack-knowledge.vercel.app",
      description: "Production (Vercel Hobby)",
    },
    { url: "http://localhost:3001", description: "Local dev" },
  ],
  tags: [
    { name: "Corpus", description: "Ingest and inspect stored documents" },
    { name: "RAG", description: "Retrieval-augmented question answering" },
    { name: "Meta", description: "Health and observability" },
  ],
  components: {
    schemas: {
      DocumentSummary: {
        type: "object",
        required: ["id", "title", "charCount", "chunks", "createdAt"],
        properties: {
          id: { type: "string", description: "Document cuid" },
          title: { type: "string" },
          charCount: { type: "integer", minimum: 0 },
          chunks: {
            type: "integer",
            minimum: 1,
            description: "Number of chunks the document was split into",
          },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      IngestRequest: {
        type: "object",
        required: ["title", "content"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 200 },
          content: { type: "string", minLength: 1, maxLength: 50000 },
        },
      },
      IngestResponse: {
        type: "object",
        required: ["documentId", "chunks"],
        properties: {
          documentId: { type: "string" },
          chunks: { type: "integer", minimum: 1 },
        },
      },
      AskRequest: {
        type: "object",
        required: ["question"],
        properties: {
          question: { type: "string", minLength: 1, maxLength: 500 },
          k: {
            type: "integer",
            minimum: 1,
            maximum: 16,
            description: "Top-K chunks to retrieve. Defaults to 6.",
          },
        },
      },
      StatsResponse: {
        type: "object",
        required: [
          "documents",
          "chunks",
          "embeddings",
          "orphanEmbeddings",
          "expectedDim",
          "embeddingModel",
          "indexType",
        ],
        properties: {
          documents: { type: "integer", minimum: 0 },
          chunks: { type: "integer", minimum: 0 },
          embeddings: { type: "integer", minimum: 0 },
          orphanEmbeddings: {
            type: "integer",
            minimum: 0,
            description:
              "Embedding rows with no resolvable Chunk. Should always be 0 in a healthy deploy.",
          },
          storedDim: {
            type: ["integer", "null"],
            description: "Dim of stored vectors (null if the table is empty).",
          },
          expectedDim: { type: "integer", description: "768 at v0.4.0" },
          embeddingModel: {
            type: "string",
            description: "e.g. 'gemini-embedding-001'",
          },
          indexType: {
            type: "string",
            description: "pgvector access method — 'hnsw' expected.",
          },
        },
      },
      ErrorResponse: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: { type: "string" },
          message: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/api/kb/ingest": {
      post: {
        tags: ["Corpus"],
        summary: "Chunk, embed, and store a pasted document",
        description:
          "Splits the pasted text into paragraph-aware ~512-char windows, embeds each chunk with `gemini-embedding-001` at 768 dim, and stores Document + Chunk + Embedding rows inside a single transaction. Rate-limited per IP (10/min) and capped globally per-container (KB_BUDGET_PER_DAY / KB_BUDGET_PER_MONTH).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/IngestRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Document ingested.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/IngestResponse" },
              },
            },
          },
          "400": {
            description: "Malformed body.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "429": {
            description:
              "Per-IP rate limit or per-container budget exceeded (see `code`).",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "503": {
            description: "`GEMINI_API_KEY` is not configured on the server.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/kb/ask": {
      post: {
        tags: ["RAG"],
        summary: "Ask a question grounded in the stored corpus",
        description:
          "Embeds the question, retrieves the top-K chunks via pgvector HNSW cosine distance, and streams a Gemini 2.0 Flash answer with numbered citations. Response headers `x-knowlex-hits` (chunk count) and `x-knowlex-docs` (pipe-separated document titles) surface retrieval metadata to the client without a second round-trip. Same rate / budget guards as /api/kb/ingest.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AskRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Streaming plain-text answer.",
            headers: {
              "x-knowlex-hits": {
                schema: { type: "integer" },
                description: "Number of chunks fed into the model.",
              },
              "x-knowlex-docs": {
                schema: { type: "string" },
                description:
                  "`|`-separated titles of the source documents cited.",
              },
            },
            content: {
              "text/plain": { schema: { type: "string" } },
            },
          },
          "400": {
            description: "Malformed body.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "429": {
            description: "Rate-limited.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "500": {
            description:
              "Retrieval failed (code `RETRIEVAL_FAILED`). Details stay in server logs.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "503": { description: "`GEMINI_API_KEY` not configured." },
        },
      },
    },
    "/api/kb/documents": {
      get: {
        tags: ["Corpus"],
        summary: "List the 50 most recent ingested documents",
        responses: {
          "200": {
            description: "Array of document summaries.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/DocumentSummary" },
                },
              },
            },
          },
        },
      },
      delete: {
        tags: ["Corpus"],
        summary: "Delete a document and cascade its chunks / embeddings",
        parameters: [
          {
            in: "query",
            name: "id",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "204": { description: "Deleted." },
          "400": {
            description: "Missing `id`.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/kb/stats": {
      get: {
        tags: ["Meta"],
        summary: "Operational probe — corpus counts, FK integrity, index type",
        description:
          "Cheap read (no Gemini calls). Shape is asserted by the live smoke workflow; an accidental index-type regression would trip `indexType === 'hnsw'` there.",
        responses: {
          "200": {
            description: "Health snapshot.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StatsResponse" },
              },
            },
          },
        },
      },
    },
    "/api/health": {
      get: {
        tags: ["Meta"],
        summary: "Static liveness probe",
        responses: { "200": { description: "`ok`" } },
      },
    },
    "/api/openapi.json": {
      get: {
        tags: ["Meta"],
        summary: "This specification",
        responses: {
          "200": {
            description: "The OpenAPI 3.1 JSON document you are reading.",
            content: { "application/json": {} },
          },
        },
      },
    },
    "/api/observability/captures": {
      get: {
        tags: ["Meta"],
        summary: "Recent error captures (demo + diagnostic)",
        description:
          "Returns the last N errors forwarded through `src/lib/observability.ts`. When `SENTRY_DSN` is set these also ship to Sentry; without it, this endpoint is the sole readable record. Gated: open in non-production, closed in production unless `ENABLE_OBSERVABILITY_API=1`. See ADR-0045.",
        responses: {
          "200": {
            description: "Ring of recent captures (newest first).",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["count", "backend", "captures"],
                  properties: {
                    count: { type: "integer", minimum: 0 },
                    backend: {
                      type: "string",
                      description:
                        "Backend used for the most recent capture — 'sentry' if DSN configured, 'memory' otherwise.",
                    },
                    captures: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          ts: { type: "string", format: "date-time" },
                          kind: { type: "string" },
                          message: { type: "string" },
                          name: { type: "string" },
                          digest: { type: "string" },
                          sourceRoute: { type: "string" },
                          env: { type: "string" },
                          backend: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "404": {
            description:
              "Disabled in production (`ENABLE_OBSERVABILITY_API` unset).",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
  },
} as const;
