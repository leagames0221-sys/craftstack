/**
 * OpenAPI 3.1 specification for the Boardly REST surface.
 *
 * Hand-written rather than auto-generated so it can act as the contract
 * rather than a reflection. The route handlers in `src/app/api/**` are
 * the implementation; this file is the canonical shape. When the two
 * drift, the spec is the arbiter.
 *
 * Served as JSON at `GET /api/openapi.json`, which is public so anyone
 * can point Swagger Editor / Scalar / Stoplight at it:
 *   https://editor.swagger.io/?url=https://craftstack-collab.vercel.app/api/openapi.json
 */
export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Boardly API",
    version: "0.2.0",
    description:
      "Boardly is the realtime-collaborative kanban half of craftstack. The authenticated REST surface is consumed by the Next.js App Router client; this spec documents that surface so third-party tools, typed SDKs, or external integrations can target it.",
    license: { name: "MIT", identifier: "MIT" },
    contact: {
      name: "craftstack",
      url: "https://github.com/leagames0221-sys/craftstack",
    },
  },
  servers: [
    {
      url: "https://craftstack-collab.vercel.app",
      description: "Production (Vercel Hobby)",
    },
    { url: "http://localhost:3000", description: "Local dev" },
  ],
  tags: [
    { name: "Workspaces", description: "Workspace CRUD and membership" },
    { name: "Boards", description: "Boards inside a workspace" },
    { name: "Lists", description: "Lists on a board" },
    { name: "Cards", description: "Cards on a list" },
    { name: "Labels", description: "Workspace-scoped labels" },
    { name: "Comments", description: "Card comments" },
    { name: "Invitations", description: "Workspace invitations flow" },
    { name: "Notifications", description: "In-app notification feed" },
    { name: "Search", description: "Cross-workspace fuzzy search" },
    { name: "Knowlex", description: "AI playground (streamed RAG)" },
    { name: "Meta", description: "Health and documentation" },
  ],
  security: [{ sessionCookie: [] }],
  components: {
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "authjs.session-token",
        description:
          "Auth.js v5 JWT session cookie. Set by the OAuth signin flow at /signin. Unauthenticated calls return 401 JSON (never a HTML redirect).",
      },
    },
    schemas: {
      Role: {
        type: "string",
        enum: ["OWNER", "ADMIN", "EDITOR", "VIEWER"],
        description:
          "Four-tier RBAC (ADR-0023). Comparator roleAtLeast gates every server write.",
      },
      Error: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: {
            type: "string",
            example: "VERSION_MISMATCH",
            description:
              "Stable machine-readable error identifier; client switches on this, not on the message.",
          },
          message: { type: "string" },
        },
      },
      Workspace: {
        type: "object",
        required: ["id", "name", "slug", "color", "role"],
        properties: {
          id: { type: "string", format: "cuid" },
          name: { type: "string" },
          slug: { type: "string", pattern: "^[a-z0-9-]+$" },
          color: { type: "string", example: "#4F46E5" },
          iconUrl: { type: "string", format: "uri", nullable: true },
          role: { $ref: "#/components/schemas/Role" },
        },
      },
      Board: {
        type: "object",
        required: ["id", "workspaceId", "title"],
        properties: {
          id: { type: "string", format: "cuid" },
          workspaceId: { type: "string", format: "cuid" },
          title: { type: "string" },
          color: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      List: {
        type: "object",
        required: ["id", "boardId", "title", "position"],
        properties: {
          id: { type: "string", format: "cuid" },
          boardId: { type: "string", format: "cuid" },
          title: { type: "string" },
          position: {
            type: "string",
            description: "LexoRank (ADR-0025) — single-row reorder.",
          },
          wipLimit: { type: "integer", nullable: true, minimum: 1 },
        },
      },
      Card: {
        type: "object",
        required: ["id", "listId", "title", "position", "version"],
        properties: {
          id: { type: "string", format: "cuid" },
          listId: { type: "string", format: "cuid" },
          title: { type: "string", maxLength: 280 },
          description: { type: "string", nullable: true },
          dueDate: {
            type: "string",
            format: "date-time",
            nullable: true,
          },
          position: { type: "string" },
          version: {
            type: "integer",
            minimum: 1,
            description:
              "Optimistic lock counter (ADR-0024). Clients must send expectedVersion; server increments on success.",
          },
        },
      },
      Label: {
        type: "object",
        required: ["id", "workspaceId", "name", "color"],
        properties: {
          id: { type: "string", format: "cuid" },
          workspaceId: { type: "string", format: "cuid" },
          name: { type: "string" },
          color: { type: "string" },
        },
      },
      Comment: {
        type: "object",
        required: ["id", "cardId", "body", "authorId"],
        properties: {
          id: { type: "string", format: "cuid" },
          cardId: { type: "string", format: "cuid" },
          body: { type: "string", maxLength: 4000 },
          authorId: { type: "string", format: "cuid" },
          createdAt: { type: "string", format: "date-time" },
          deletedAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "Soft-delete timestamp; excluded by default.",
          },
        },
      },
      Notification: {
        type: "object",
        required: ["id", "type", "payload", "createdAt"],
        properties: {
          id: { type: "string", format: "cuid" },
          type: {
            type: "string",
            enum: [
              "MENTION",
              "ASSIGNED",
              "DUE_SOON",
              "INVITED",
              "COMMENT_ON_CARD",
            ],
          },
          payload: { type: "object", additionalProperties: true },
          readAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      SearchHits: {
        type: "object",
        properties: {
          workspaces: {
            type: "array",
            items: { $ref: "#/components/schemas/Workspace" },
          },
          boards: {
            type: "array",
            items: { $ref: "#/components/schemas/Board" },
          },
          cards: {
            type: "array",
            items: { $ref: "#/components/schemas/Card" },
          },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: "Missing or invalid session cookie.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            examples: {
              default: {
                value: { code: "UNAUTHORIZED", message: "Sign in required." },
              },
            },
          },
        },
      },
      Forbidden: {
        description:
          "Session valid but RBAC gate or cross-workspace guard denied the action.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      NotFound: {
        description:
          "Target not found, or authenticated caller has no access to it (same response to prevent existence-leak).",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      Conflict: {
        description:
          "Optimistic-lock or uniqueness conflict (e.g. SLUG_TAKEN, VERSION_MISMATCH).",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      RateLimited: {
        description: "Sliding-window rate limit tripped.",
        headers: {
          "Retry-After": {
            schema: { type: "integer" },
            description: "Seconds until the next attempt is permitted.",
          },
        },
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
    },
    parameters: {
      WorkspaceId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "cuid" },
      },
      BoardId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "cuid" },
      },
      ListId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "cuid" },
      },
      CardId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "cuid" },
      },
    },
  },
  paths: {
    "/api/health": {
      get: {
        tags: ["Meta"],
        summary: "Liveness probe",
        security: [],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { ok: { type: "boolean" } },
                },
              },
            },
          },
        },
      },
    },

    "/api/workspaces": {
      get: {
        tags: ["Workspaces"],
        summary: "List workspaces the caller is a member of",
        responses: {
          "200": {
            description: "Workspaces",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Workspace" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Workspaces"],
        summary: "Create a workspace (caller becomes OWNER)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "slug"],
                properties: {
                  name: { type: "string", minLength: 1, maxLength: 80 },
                  slug: { type: "string", pattern: "^[a-z0-9-]+$" },
                  color: { type: "string" },
                },
              },
              examples: {
                default: {
                  summary: "Create a demo workspace",
                  value: {
                    name: "Acme Engineering",
                    slug: "acme-eng",
                    color: "#6366F1",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Workspace" },
              },
            },
          },
          "400": {
            description: "Invalid body",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "409": { $ref: "#/components/responses/Conflict" },
        },
      },
    },

    "/api/workspaces/{id}/members": {
      get: {
        tags: ["Workspaces"],
        summary: "List workspace members (ADMIN+)",
        parameters: [{ $ref: "#/components/parameters/WorkspaceId" }],
        responses: {
          "200": { description: "Members" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    "/api/workspaces/{id}/invitations": {
      post: {
        tags: ["Invitations"],
        summary: "Create an invitation (ADMIN+, token-hashed, rate-limited)",
        description:
          "Token is surfaced only in the email + returned acceptUrl; only SHA-256(token) is persisted (ADR-0026). Three-layer rate limit applies (ADR-0027).",
        parameters: [{ $ref: "#/components/parameters/WorkspaceId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "role"],
                properties: {
                  email: { type: "string", format: "email" },
                  role: { $ref: "#/components/schemas/Role" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created — includes one-time acceptUrl",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    acceptUrl: { type: "string", format: "uri" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },

    "/api/workspaces/{id}/labels": {
      get: {
        tags: ["Labels"],
        summary: "List workspace labels",
        parameters: [{ $ref: "#/components/parameters/WorkspaceId" }],
        responses: {
          "200": {
            description: "Labels",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Label" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Labels"],
        summary: "Create a label (ADMIN+)",
        parameters: [{ $ref: "#/components/parameters/WorkspaceId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "color"],
                properties: {
                  name: { type: "string", maxLength: 40 },
                  color: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Created" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },

    "/api/workspaces/{id}/activity": {
      get: {
        tags: ["Workspaces"],
        summary: "Workspace activity feed (cursor-paginated)",
        parameters: [
          { $ref: "#/components/parameters/WorkspaceId" },
          {
            name: "cursor",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Activity page" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },

    "/api/boards/{id}/lists": {
      post: {
        tags: ["Lists"],
        summary: "Create a list on a board (EDITOR+)",
        parameters: [{ $ref: "#/components/parameters/BoardId" }],
        requestBody: { required: true },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/List" },
              },
            },
          },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    "/api/lists/{id}": {
      patch: {
        tags: ["Lists"],
        summary: "Update a list (title / wipLimit, ADMIN+ for wipLimit)",
        parameters: [{ $ref: "#/components/parameters/ListId" }],
        responses: {
          "200": { description: "Updated" },
          "400": {
            description: "Bad input (e.g. wipLimit not a positive integer)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
      delete: {
        tags: ["Lists"],
        summary: "Soft-delete a list (ADMIN+)",
        parameters: [{ $ref: "#/components/parameters/ListId" }],
        responses: {
          "204": { description: "Deleted" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },

    "/api/lists/{id}/cards": {
      post: {
        tags: ["Cards"],
        summary: "Create a card at the bottom of a list (EDITOR+)",
        parameters: [{ $ref: "#/components/parameters/ListId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title"],
                properties: {
                  title: { type: "string", minLength: 1, maxLength: 280 },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Card" },
              },
            },
          },
        },
      },
    },

    "/api/cards/{id}": {
      get: {
        tags: ["Cards"],
        summary: "Fetch a card with its labels, assignees, and version",
        parameters: [{ $ref: "#/components/parameters/CardId" }],
        responses: {
          "200": {
            description: "Card",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Card" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Cards"],
        summary: "Update card fields (EDITOR+; respects optimistic lock)",
        parameters: [{ $ref: "#/components/parameters/CardId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["expectedVersion"],
                properties: {
                  expectedVersion: { type: "integer", minimum: 1 },
                  title: { type: "string" },
                  description: { type: "string", nullable: true },
                  dueDate: {
                    type: "string",
                    format: "date-time",
                    nullable: true,
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Updated" },
          "409": {
            description:
              "VERSION_MISMATCH — someone else updated this card first; refetch and retry.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
      delete: {
        tags: ["Cards"],
        summary: "Delete a card (EDITOR+)",
        parameters: [{ $ref: "#/components/parameters/CardId" }],
        responses: {
          "204": { description: "Deleted" },
        },
      },
    },

    "/api/cards/{id}/move": {
      post: {
        tags: ["Cards"],
        summary: "Move a card to a new list / position (EDITOR+)",
        description:
          "Optimistic-lock protected. Pass expectedVersion; a 409 indicates the card moved concurrently and the client should refetch.",
        parameters: [{ $ref: "#/components/parameters/CardId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["targetListId", "position", "expectedVersion"],
                properties: {
                  targetListId: { type: "string", format: "cuid" },
                  position: { type: "string" },
                  expectedVersion: { type: "integer", minimum: 1 },
                },
              },
              examples: {
                default: {
                  summary: "Move into the first slot of a Done list",
                  value: {
                    targetListId: "ckl4j8a5g0000iv0b9d8d5m5x",
                    position: "0|i0000f:",
                    expectedVersion: 3,
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Moved" },
          "409": { $ref: "#/components/responses/Conflict" },
        },
      },
    },

    "/api/cards/{id}/labels": {
      put: {
        tags: ["Labels"],
        summary:
          "Full-replace the card's label set (ADR-0028). Cross-workspace guard (ADR-0029) rejects foreign label IDs.",
        parameters: [{ $ref: "#/components/parameters/CardId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["labelIds"],
                properties: {
                  labelIds: {
                    type: "array",
                    items: { type: "string", format: "cuid" },
                  },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Replaced" } },
      },
    },

    "/api/cards/{id}/assignees": {
      put: {
        tags: ["Cards"],
        summary:
          "Full-replace the card's assignees. Non-member userIds are rejected.",
        parameters: [{ $ref: "#/components/parameters/CardId" }],
        requestBody: { required: true },
        responses: { "200": { description: "Replaced" } },
      },
    },

    "/api/cards/{id}/comments": {
      get: {
        tags: ["Comments"],
        summary: "List comments on a card",
        parameters: [{ $ref: "#/components/parameters/CardId" }],
        responses: {
          "200": {
            description: "Comments",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Comment" },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Comments"],
        summary: "Post a comment (EDITOR+). @mentions fire notifications.",
        parameters: [{ $ref: "#/components/parameters/CardId" }],
        requestBody: { required: true },
        responses: { "201": { description: "Created" } },
      },
    },

    "/api/cards/{id}/activity": {
      get: {
        tags: ["Cards"],
        summary: "Card-scoped activity history",
        parameters: [{ $ref: "#/components/parameters/CardId" }],
        responses: { "200": { description: "Activity" } },
      },
    },

    "/api/comments/{id}": {
      delete: {
        tags: ["Comments"],
        summary: "Soft-delete a comment (author or ADMIN+)",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "204": { description: "Deleted" } },
      },
    },

    "/api/labels/{id}": {
      patch: {
        tags: ["Labels"],
        summary: "Update a workspace label (ADMIN+)",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "200": { description: "Updated" } },
      },
      delete: {
        tags: ["Labels"],
        summary: "Delete a workspace label (ADMIN+)",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "204": { description: "Deleted" } },
      },
    },

    "/api/invitations/accept": {
      post: {
        tags: ["Invitations"],
        summary: "Accept an invitation using its one-time token",
        description:
          "Requires signed-in email to match the invitation's email (ADR-0026).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token"],
                properties: { token: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Membership created" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": {
            description:
              "Token valid but signed-in email does not match the invitation target.",
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    "/api/invitations/{id}/revoke": {
      post: {
        tags: ["Invitations"],
        summary: "Revoke a pending invitation (ADMIN+)",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "204": { description: "Revoked" } },
      },
    },

    "/api/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "List notifications (most-recent first)",
        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 100 },
          },
        ],
        responses: {
          "200": {
            description: "Notifications + unread count",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    rows: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Notification" },
                    },
                    unread: { type: "integer", minimum: 0 },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },

    "/api/notifications/read": {
      post: {
        tags: ["Notifications"],
        summary: "Mark every notification read",
        responses: { "204": { description: "All marked read" } },
      },
    },

    "/api/notifications/{id}/read": {
      post: {
        tags: ["Notifications"],
        summary: "Mark a single notification read",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "204": { description: "Marked read" } },
      },
    },

    "/api/search": {
      get: {
        tags: ["Search"],
        summary: "Cross-workspace fuzzy search (membership-scoped server-side)",
        parameters: [
          {
            name: "q",
            in: "query",
            required: false,
            schema: { type: "string" },
            description:
              "Empty query returns recent workspaces + boards (jump-to mode).",
          },
        ],
        responses: {
          "200": {
            description: "Hits",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SearchHits" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },

    "/api/kb/ask": {
      post: {
        tags: ["Knowlex"],
        summary:
          "Stream a Gemini 2.0 Flash answer grounded in the supplied context",
        description:
          "Public / no auth. Missing GEMINI_API_KEY falls back to a deterministic demo mode streaming a canned answer with an x-playground-mode: demo header. Per-IP sliding-window rate limit (10/min); global daily/monthly budget as belt-and-suspenders (see ADR-0037 + COST_SAFETY.md).",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["context", "question"],
                properties: {
                  context: { type: "string", minLength: 1, maxLength: 12000 },
                  question: { type: "string", minLength: 1, maxLength: 500 },
                },
              },
              examples: {
                default: {
                  summary: "Ground on a pasted passage",
                  value: {
                    context:
                      "Boardly uses LexoRank strings for list and card ordering so reordering touches one row instead of N. Optimistic locking via a version column prevents stale-write races on concurrent drags.",
                    question: "How does Boardly reorder cards?",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Streaming text/plain. Mode surfaced via the x-playground-mode response header (live | demo).",
            headers: {
              "x-playground-mode": {
                schema: {
                  type: "string",
                  enum: ["live", "demo"],
                },
              },
            },
            content: { "text/plain": { schema: { type: "string" } } },
          },
          "400": {
            description: "Invalid body",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },

    "/api/openapi.json": {
      get: {
        tags: ["Meta"],
        summary: "This OpenAPI specification as JSON",
        security: [],
        responses: {
          "200": {
            description: "The spec itself",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
    },
  },
} as const;
