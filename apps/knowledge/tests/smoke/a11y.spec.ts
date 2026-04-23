import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Accessibility smoke for Knowlex public surfaces. Mirrors the collab
 * a11y gate — zero tolerance for `serious` or `critical` WCAG 2.1 AA
 * violations, `moderate` / `minor` are logged but non-blocking.
 *
 * Knowlex's entire public surface is two routes + the auto-generated
 * API docs (when ADR-0044 ships the /docs/api page). Everything else
 * is behind the no-auth-yet MVP UI which still deserves a clean
 * baseline.
 */

const PUBLIC_ROUTES = ["/", "/kb"];

for (const route of PUBLIC_ROUTES) {
  test(`${route} has no serious or critical a11y violations`, async ({
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
