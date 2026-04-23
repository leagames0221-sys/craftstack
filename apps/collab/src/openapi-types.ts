/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate via `pnpm --filter collab generate:api-types` after
 * editing `src/openapi.ts`. See scripts/generate-api-types.ts.
 */
export interface paths {
  "/api/health": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Liveness probe */
    get: {
      parameters: {
        query?: never;
        header?: never;
        path?: never;
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description OK */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": {
              ok?: boolean;
            };
          };
        };
      };
    };
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/workspaces": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List workspaces the caller is a member of */
    get: {
      parameters: {
        query?: never;
        header?: never;
        path?: never;
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Workspaces */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["Workspace"][];
          };
        };
        401: components["responses"]["Unauthorized"];
      };
    };
    put?: never;
    /** Create a workspace (caller becomes OWNER) */
    post: {
      parameters: {
        query?: never;
        header?: never;
        path?: never;
        cookie?: never;
      };
      requestBody: {
        content: {
          "application/json": {
            name: string;
            slug: string;
            color?: string;
          };
        };
      };
      responses: {
        /** @description Created */
        201: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["Workspace"];
          };
        };
        /** @description Invalid body */
        400: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["Error"];
          };
        };
        401: components["responses"]["Unauthorized"];
        409: components["responses"]["Conflict"];
      };
    };
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/workspaces/{id}/members": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List workspace members (ADMIN+) */
    get: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: components["parameters"]["WorkspaceId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Members */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
        401: components["responses"]["Unauthorized"];
        403: components["responses"]["Forbidden"];
        404: components["responses"]["NotFound"];
      };
    };
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/workspaces/{id}/invitations": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Create an invitation (ADMIN+, token-hashed, rate-limited)
     * @description Token is surfaced only in the email + returned acceptUrl; only SHA-256(token) is persisted (ADR-0026). Three-layer rate limit applies (ADR-0027).
     */
    post: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: components["parameters"]["WorkspaceId"];
        };
        cookie?: never;
      };
      requestBody: {
        content: {
          "application/json": {
            /** Format: email */
            email: string;
            role: components["schemas"]["Role"];
          };
        };
      };
      responses: {
        /** @description Created — includes one-time acceptUrl */
        201: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": {
              id?: string;
              /** Format: uri */
              acceptUrl?: string;
            };
          };
        };
        401: components["responses"]["Unauthorized"];
        403: components["responses"]["Forbidden"];
        429: components["responses"]["RateLimited"];
      };
    };
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/workspaces/{id}/labels": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List workspace labels */
    get: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: components["parameters"]["WorkspaceId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Labels */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["Label"][];
          };
        };
        401: components["responses"]["Unauthorized"];
        403: components["responses"]["Forbidden"];
      };
    };
    put?: never;
    /** Create a label (ADMIN+) */
    post: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: components["parameters"]["WorkspaceId"];
        };
        cookie?: never;
      };
      requestBody: {
        content: {
          "application/json": {
            name: string;
            color: string;
          };
        };
      };
      responses: {
        /** @description Created */
        201: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
        403: components["responses"]["Forbidden"];
      };
    };
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/workspaces/{id}/activity": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Workspace activity feed (cursor-paginated) */
    get: {
      parameters: {
        query?: {
          cursor?: string;
        };
        header?: never;
        path: {
          id: components["parameters"]["WorkspaceId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Activity page */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
        401: components["responses"]["Unauthorized"];
        403: components["responses"]["Forbidden"];
      };
    };
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/boards/{id}/lists": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Create a list on a board (EDITOR+) */
    post: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: components["parameters"]["BoardId"];
        };
        cookie?: never;
      };
      requestBody: {
        content: {
          "*/*"?: never;
        };
      };
      responses: {
        /** @description Created */
        201: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["List"];
          };
        };
        403: components["responses"]["Forbidden"];
        404: components["responses"]["NotFound"];
      };
    };
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/lists/{id}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Soft-delete a list (ADMIN+) */
    delete: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: components["parameters"]["ListId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Deleted */
        204: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
        403: components["responses"]["Forbidden"];
      };
    };
    options?: never;
    head?: never;
    /** Update a list (title / wipLimit, ADMIN+ for wipLimit) */
    patch: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: components["parameters"]["ListId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Updated */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
        /** @description Bad input (e.g. wipLimit not a positive integer) */
        400: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["Error"];
          };
        };
        403: components["responses"]["Forbidden"];
      };
    };
    trace?: never;
  };
  "/api/lists/{id}/cards": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Create a card at the bottom of a list (EDITOR+) */
    post: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: components["parameters"]["ListId"];
        };
        cookie?: never;
      };
      requestBody: {
        content: {
          "application/json": {
            title: string;
          };
        };
      };
      responses: {
        /** @description Created */
        201: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["Card"];
          };
        };
      };
    };
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/cards/{id}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Fetch a card with its labels, assignees, and version */
    get: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: components["parameters"]["CardId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Card */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["Card"];
          };
        };
        404: components["responses"]["NotFound"];
      };
    };
    put?: never;
    post?: never;
    /** Delete a card (EDITOR+) */
    delete: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: components["parameters"]["CardId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Deleted */
        204: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
      };
    };
    options?: never;
    head?: never;
    /** Update card fields (EDITOR+; respects optimistic lock) */
    patch: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: components["parameters"]["CardId"];
        };
        cookie?: never;
      };
      requestBody: {
        content: {
          "application/json": {
            expectedVersion: number;
            title?: string;
            description?: string | null;
            /** Format: date-time */
            dueDate?: string | null;
          };
        };
      };
      responses: {
        /** @description Updated */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
        /** @description VERSION_MISMATCH — someone else updated this card first; refetch and retry. */
        409: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["Error"];
          };
        };
      };
    };
    trace?: never;
  };
  "/api/cards/{id}/move": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Move a card to a new list / position (EDITOR+)
     * @description Optimistic-lock protected. Pass expectedVersion; a 409 indicates the card moved concurrently and the client should refetch.
     */
    post: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: components["parameters"]["CardId"];
        };
        cookie?: never;
      };
      requestBody: {
        content: {
          "application/json": {
            /** Format: cuid */
            targetListId: string;
            position: string;
            expectedVersion: number;
          };
        };
      };
      responses: {
        /** @description Moved */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
        409: components["responses"]["Conflict"];
      };
    };
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/cards/{id}/labels": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Full-replace the card's label set (ADR-0028). Cross-workspace guard (ADR-0029) rejects foreign label IDs. */
    put: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: components["parameters"]["CardId"];
        };
        cookie?: never;
      };
      requestBody: {
        content: {
          "application/json": {
            labelIds: string[];
          };
        };
      };
      responses: {
        /** @description Replaced */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
      };
    };
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/cards/{id}/assignees": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Full-replace the card's assignees. Non-member userIds are rejected. */
    put: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: components["parameters"]["CardId"];
        };
        cookie?: never;
      };
      requestBody: {
        content: {
          "*/*"?: never;
        };
      };
      responses: {
        /** @description Replaced */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
      };
    };
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/cards/{id}/comments": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List comments on a card */
    get: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: components["parameters"]["CardId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Comments */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["Comment"][];
          };
        };
      };
    };
    put?: never;
    /** Post a comment (EDITOR+). @mentions fire notifications. */
    post: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: components["parameters"]["CardId"];
        };
        cookie?: never;
      };
      requestBody: {
        content: {
          "*/*"?: never;
        };
      };
      responses: {
        /** @description Created */
        201: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
      };
    };
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/cards/{id}/activity": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Card-scoped activity history */
    get: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: components["parameters"]["CardId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Activity */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
      };
    };
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/comments/{id}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Soft-delete a comment (author or ADMIN+) */
    delete: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: string;
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Deleted */
        204: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
      };
    };
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/labels/{id}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Delete a workspace label (ADMIN+) */
    delete: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: string;
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Deleted */
        204: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
      };
    };
    options?: never;
    head?: never;
    /** Update a workspace label (ADMIN+) */
    patch: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: string;
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Updated */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
      };
    };
    trace?: never;
  };
  "/api/invitations/accept": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Accept an invitation using its one-time token
     * @description Requires signed-in email to match the invitation's email (ADR-0026).
     */
    post: {
      parameters: {
        query?: never;
        header?: never;
        path?: never;
        cookie?: never;
      };
      requestBody: {
        content: {
          "application/json": {
            token: string;
          };
        };
      };
      responses: {
        /** @description Membership created */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
        401: components["responses"]["Unauthorized"];
        /** @description Token valid but signed-in email does not match the invitation target. */
        403: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
        404: components["responses"]["NotFound"];
      };
    };
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/invitations/{id}/revoke": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Revoke a pending invitation (ADMIN+) */
    post: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: string;
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Revoked */
        204: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
      };
    };
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/notifications": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List notifications (most-recent first) */
    get: {
      parameters: {
        query?: {
          limit?: number;
        };
        header?: never;
        path?: never;
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Notifications + unread count */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": {
              rows?: components["schemas"]["Notification"][];
              unread?: number;
            };
          };
        };
        401: components["responses"]["Unauthorized"];
      };
    };
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/notifications/read": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Mark every notification read */
    post: {
      parameters: {
        query?: never;
        header?: never;
        path?: never;
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description All marked read */
        204: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
      };
    };
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/notifications/{id}/read": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Mark a single notification read */
    post: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          id: string;
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Marked read */
        204: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
      };
    };
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/search": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Cross-workspace fuzzy search (membership-scoped server-side) */
    get: {
      parameters: {
        query?: {
          /** @description Empty query returns recent workspaces + boards (jump-to mode). */
          q?: string;
        };
        header?: never;
        path?: never;
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Hits */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["SearchHits"];
          };
        };
        401: components["responses"]["Unauthorized"];
      };
    };
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/kb/ask": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Stream a Gemini 2.0 Flash answer grounded in the supplied context
     * @description Public / no auth. Missing GEMINI_API_KEY falls back to a deterministic demo mode streaming a canned answer with an x-playground-mode: demo header. Per-IP sliding-window rate limit (10/min).
     */
    post: {
      parameters: {
        query?: never;
        header?: never;
        path?: never;
        cookie?: never;
      };
      requestBody: {
        content: {
          "application/json": {
            context: string;
            question: string;
          };
        };
      };
      responses: {
        /** @description Streaming text/plain. Mode surfaced via the x-playground-mode response header (live | demo). */
        200: {
          headers: {
            "x-playground-mode"?: "live" | "demo";
            [name: string]: unknown;
          };
          content: {
            "text/plain": string;
          };
        };
        /** @description Invalid body */
        400: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["Error"];
          };
        };
        429: components["responses"]["RateLimited"];
      };
    };
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/openapi.json": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** This OpenAPI specification as JSON */
    get: {
      parameters: {
        query?: never;
        header?: never;
        path?: never;
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description The spec itself */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": Record<string, never>;
          };
        };
      };
    };
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    /**
     * @description Four-tier RBAC (ADR-0023). Comparator roleAtLeast gates every server write.
     * @enum {string}
     */
    Role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
    Error: {
      /**
       * @description Stable machine-readable error identifier; client switches on this, not on the message.
       * @example VERSION_MISMATCH
       */
      code: string;
      message: string;
    };
    Workspace: {
      /** Format: cuid */
      id: string;
      name: string;
      slug: string;
      /** @example #4F46E5 */
      color: string;
      /** Format: uri */
      iconUrl?: string | null;
      role: components["schemas"]["Role"];
    };
    Board: {
      /** Format: cuid */
      id: string;
      /** Format: cuid */
      workspaceId: string;
      title: string;
      color?: string | null;
      /** Format: date-time */
      createdAt?: string;
      /** Format: date-time */
      updatedAt?: string;
    };
    List: {
      /** Format: cuid */
      id: string;
      /** Format: cuid */
      boardId: string;
      title: string;
      /** @description LexoRank (ADR-0025) — single-row reorder. */
      position: string;
      wipLimit?: number | null;
    };
    Card: {
      /** Format: cuid */
      id: string;
      /** Format: cuid */
      listId: string;
      title: string;
      description?: string | null;
      /** Format: date-time */
      dueDate?: string | null;
      position: string;
      /** @description Optimistic lock counter (ADR-0024). Clients must send expectedVersion; server increments on success. */
      version: number;
    };
    Label: {
      /** Format: cuid */
      id: string;
      /** Format: cuid */
      workspaceId: string;
      name: string;
      color: string;
    };
    Comment: {
      /** Format: cuid */
      id: string;
      /** Format: cuid */
      cardId: string;
      body: string;
      /** Format: cuid */
      authorId: string;
      /** Format: date-time */
      createdAt?: string;
      /**
       * Format: date-time
       * @description Soft-delete timestamp; excluded by default.
       */
      deletedAt?: string | null;
    };
    Notification: {
      /** Format: cuid */
      id: string;
      /** @enum {string} */
      type: "MENTION" | "ASSIGNED" | "DUE_SOON" | "INVITED" | "COMMENT_ON_CARD";
      payload: {
        [key: string]: unknown;
      };
      /** Format: date-time */
      readAt?: string | null;
      /** Format: date-time */
      createdAt: string;
    };
    SearchHits: {
      workspaces?: components["schemas"]["Workspace"][];
      boards?: components["schemas"]["Board"][];
      cards?: components["schemas"]["Card"][];
    };
  };
  responses: {
    /** @description Missing or invalid session cookie. */
    Unauthorized: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        "application/json": components["schemas"]["Error"];
      };
    };
    /** @description Session valid but RBAC gate or cross-workspace guard denied the action. */
    Forbidden: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        "application/json": components["schemas"]["Error"];
      };
    };
    /** @description Target not found, or authenticated caller has no access to it (same response to prevent existence-leak). */
    NotFound: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        "application/json": components["schemas"]["Error"];
      };
    };
    /** @description Optimistic-lock or uniqueness conflict (e.g. SLUG_TAKEN, VERSION_MISMATCH). */
    Conflict: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        "application/json": components["schemas"]["Error"];
      };
    };
    /** @description Sliding-window rate limit tripped. */
    RateLimited: {
      headers: {
        /** @description Seconds until the next attempt is permitted. */
        "Retry-After"?: number;
        [name: string]: unknown;
      };
      content: {
        "application/json": components["schemas"]["Error"];
      };
    };
  };
  parameters: {
    WorkspaceId: string;
    BoardId: string;
    ListId: string;
    CardId: string;
  };
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
