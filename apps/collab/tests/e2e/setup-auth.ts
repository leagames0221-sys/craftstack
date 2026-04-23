import {
  request as playwrightRequest,
  expect,
  test as setup,
} from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**
 * Global setup: sign in via the CI-only Credentials provider and write
 * the resulting session cookie to `.auth/<role>.json` so authed specs
 * can `test.use({ storageState })` without repeating the dance.
 *
 * The Credentials provider is only registered when both `E2E_ENABLED=1`
 * and `E2E_SHARED_SECRET` are set AND `NODE_ENV !== "production"`. If the
 * env isn't present this setup fails fast — as intended; we never want
 * authed specs running without a verified credentials provider.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.E2E_SHARED_SECRET ?? "";

const IDENTITIES = [
  { role: "owner", email: "e2e+owner@e2e.example" },
  { role: "editor", email: "e2e+editor@e2e.example" },
] as const;

for (const { role, email } of IDENTITIES) {
  setup(`authenticate as ${role}`, async () => {
    expect(
      SECRET.length,
      "E2E_SHARED_SECRET must be set",
    ).toBeGreaterThanOrEqual(16);

    const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL });

    // 1) Get CSRF token (Auth.js requires it on credentials callback).
    const csrfRes = await ctx.get("/api/auth/csrf");
    expect(csrfRes.ok()).toBeTruthy();
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    expect(csrfToken, "csrfToken").toBeTruthy();

    // 2) POST to the Credentials callback — Auth.js sets the session cookie.
    const signinRes = await ctx.post("/api/auth/callback/e2e", {
      form: {
        csrfToken,
        email,
        secret: SECRET,
        callbackUrl: "/dashboard",
      },
      // Don't auto-follow redirects; we just want the Set-Cookie.
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    // Auth.js responds with 302 on success; tolerate 200/3xx.
    expect(
      signinRes.status(),
      `credentials callback failed for ${email}`,
    ).toBeLessThan(400);

    // 3) Verify the cookie actually authenticates us.
    const sessionRes = await ctx.get("/api/auth/session");
    const session = (await sessionRes.json()) as {
      user?: { email?: string };
    } | null;
    expect(session?.user?.email, "session user after signin").toBe(email);

    const outPath = resolve(__dirname, `../../playwright/.auth/${role}.json`);
    await mkdir(dirname(outPath), { recursive: true });
    await ctx.storageState({ path: outPath });
    await writeFile(
      resolve(__dirname, `../../playwright/.auth/${role}.meta.json`),
      JSON.stringify({ email, createdAt: new Date().toISOString() }, null, 2),
    );
    await ctx.dispose();
  });
}
