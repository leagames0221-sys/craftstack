import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Accessibility smoke — every public page must clear axe-core WCAG A+AA
 * scans for serious and critical violations. Moderate and minor are
 * reported but don't fail the run; they're logged so we can review and
 * fix drift over time.
 *
 * The public surfaces:
 *   - /            landing page
 *   - /signin      OAuth provider buttons
 *   - /playground  Knowlex RAG demo
 */

const PUBLIC_ROUTES = ["/", "/signin", "/playground"];

for (const route of PUBLIC_ROUTES) {
  test(`${route} has no serious or critical a11y violations`, async ({
    page,
  }) => {
    await page.goto(route);
    // Give the landing/playground hydration a moment so dynamic
    // aria-live regions and buttons settle before we scan.
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );

    if (blocking.length > 0) {
      // Make the failure message actually useful — axe's default toString
      // is enormous, so emit the top 3 with node targets only.
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
