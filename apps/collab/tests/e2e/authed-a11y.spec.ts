import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * axe-core a11y gate for authenticated pages. Covers the three
 * authenticated surfaces a user actually spends time on — dashboard,
 * workspace overview, and board view. Complements tests/e2e/a11y.spec.ts
 * which handles public pages.
 *
 * Gate: zero `serious` or `critical` WCAG 2.1 AA violations per page.
 */

const AUTHED_ROUTES = [
  "/dashboard",
  "/w/e2e",
  "/w/e2e/b/seed-e2e-board",
] as const;

for (const route of AUTHED_ROUTES) {
  test(`${route} has no serious or critical a11y violations (authed)`, async ({
    page,
  }) => {
    await page.goto(route);
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );

    if (blocking.length > 0) {
      const summary = blocking
        .slice(0, 3)
        .map(
          (v) =>
            `${v.id} (${v.impact}): ${v.help} @ ${v.nodes
              .slice(0, 3)
              .map((n) => n.target.join(" "))
              .join(", ")}`,
        )
        .join("\n");
      throw new Error(
        `axe found ${blocking.length} blocking violation(s) on ${route}:\n${summary}`,
      );
    }

    expect(blocking).toHaveLength(0);
  });
}
