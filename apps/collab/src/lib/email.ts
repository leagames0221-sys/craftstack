/**
 * Resend-backed email sender. Env-guarded: when `RESEND_API_KEY` is absent
 * (local dev, preview deploys, CI), falls through to a console log of the
 * payload so the invite flow remains testable without provisioning Resend.
 */

type InviteEmailInput = {
  to: string;
  inviterName: string | null;
  workspaceName: string;
  acceptUrl: string;
};

export async function sendInvitationEmail(
  input: InviteEmailInput,
): Promise<{ delivered: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "invites@boardly.dev";

  if (!apiKey) {
    console.info(
      `[email] (no RESEND_API_KEY) would send invite to ${input.to} -> ${input.acceptUrl}`,
    );
    return { delivered: false };
  }

  const subject = `${input.inviterName ?? "Someone"} invited you to ${input.workspaceName} on Boardly`;
  const html = renderInviteHtml(input);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.warn("[email] resend delivery failed", res.status, detail);
    return { delivered: false };
  }
  return { delivered: true };
}

function renderInviteHtml({
  inviterName,
  workspaceName,
  acceptUrl,
}: InviteEmailInput): string {
  const who = inviterName ? escapeHtml(inviterName) : "A teammate";
  const ws = escapeHtml(workspaceName);
  return `<!doctype html>
<html>
<body style="font-family: -apple-system, Segoe UI, sans-serif; background:#0a0a0a; color:#e5e5e5; padding:24px;">
  <div style="max-width:480px; margin:0 auto; background:#171717; border:1px solid #262626; border-radius:16px; padding:24px;">
    <h1 style="margin:0 0 8px; font-size:20px;">You're invited to Boardly</h1>
    <p style="margin:0 0 16px; color:#a3a3a3;">${who} invited you to collaborate on <strong>${ws}</strong>.</p>
    <a href="${acceptUrl}" style="display:inline-block; background:#6366F1; color:#fff; text-decoration:none; padding:10px 20px; border-radius:8px; font-weight:500;">Accept invitation</a>
    <p style="margin:16px 0 0; color:#737373; font-size:12px;">If the button doesn't work, paste this link in your browser: ${acceptUrl}</p>
    <p style="margin:16px 0 0; color:#737373; font-size:12px;">This invitation expires in 7 days.</p>
  </div>
</body>
</html>`;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
