"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Role } from "@prisma/client";

type Member = {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
};

type Invitation = {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
};

type Props = {
  workspaceId: string;
  canInvite: boolean;
  members: Member[];
  invitations: Invitation[];
  myRole: Role;
};

export function MembersSection({
  workspaceId,
  canInvite,
  members,
  invitations,
  myRole,
}: Props) {
  return (
    <section className="mt-12 space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Members</h2>
        <p className="mt-1 text-sm text-neutral-400">
          {members.length} member{members.length === 1 ? "" : "s"} · your role:{" "}
          <RoleBadge role={myRole} />
        </p>
        <ul className="mt-4 divide-y divide-neutral-800 rounded-2xl border border-neutral-800 bg-neutral-900">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between px-5 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-neutral-800 flex items-center justify-center text-xs text-neutral-400">
                  {(m.name ?? m.email).charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium">{m.name ?? m.email}</div>
                  <div className="text-xs text-neutral-500">{m.email}</div>
                </div>
              </div>
              <RoleBadge role={m.role} />
            </li>
          ))}
        </ul>
      </div>

      {canInvite ? (
        <InvitePanel
          workspaceId={workspaceId}
          initialInvitations={invitations}
        />
      ) : null}
    </section>
  );
}

function InvitePanel({
  workspaceId,
  initialInvitations,
}: {
  workspaceId: string;
  initialInvitations: Invitation[];
}) {
  const router = useRouter();
  const [invitations, setInvitations] = useState(initialInvitations);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("EDITOR");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [lastAcceptUrl, setLastAcceptUrl] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setLastAcceptUrl(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/invitations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({
          kind: "err",
          text:
            (body && typeof body.message === "string" && body.message) ||
            "Could not create invitation.",
        });
        return;
      }
      setMessage({ kind: "ok", text: `Invitation sent to ${body.email}.` });
      setLastAcceptUrl(
        typeof body.acceptUrl === "string" ? body.acceptUrl : null,
      );
      setInvitations((prev) => [
        {
          id: body.id,
          email: body.email,
          role: body.role,
          expiresAt: body.expiresAt,
        },
        ...prev,
      ]);
      setEmail("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async (invitationId: string) => {
    const res = await fetch(`/api/invitations/${invitationId}/revoke`, {
      method: "POST",
    });
    if (res.ok) {
      setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setMessage({
        kind: "err",
        text:
          (body && typeof body.message === "string" && body.message) ||
          "Could not revoke invitation.",
      });
    }
  };

  return (
    <div>
      <h3 className="text-lg font-semibold tracking-tight">Invitations</h3>
      <p className="mt-1 text-sm text-neutral-400">
        ADMIN+ can invite teammates by email. Links expire after 7 days.
      </p>

      <form
        onSubmit={submit}
        className="mt-4 flex flex-col gap-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:flex-row"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="teammate@example.com"
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          aria-label="Role"
        >
          <option value="ADMIN">ADMIN</option>
          <option value="EDITOR">EDITOR</option>
          <option value="VIEWER">VIEWER</option>
        </select>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 transition disabled:opacity-60"
        >
          {submitting ? "Sending…" : "Invite"}
        </button>
      </form>

      {message ? (
        <div
          role="status"
          aria-live="polite"
          className={`mt-3 rounded-md border px-3 py-2 text-xs ${
            message.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      {lastAcceptUrl ? (
        <div className="mt-3 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
          <div className="mb-1 font-medium">Share this link:</div>
          <code className="break-all text-sky-100">{lastAcceptUrl}</code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(lastAcceptUrl);
            }}
            className="ml-2 rounded border border-sky-500/40 px-2 py-0.5 text-[10px] text-sky-100 hover:bg-sky-500/20"
          >
            Copy
          </button>
        </div>
      ) : null}

      {invitations.length > 0 ? (
        <ul className="mt-4 divide-y divide-neutral-800 rounded-2xl border border-neutral-800 bg-neutral-900">
          {invitations.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center justify-between px-5 py-3"
            >
              <div>
                <div className="text-sm font-medium">{inv.email}</div>
                <div className="text-xs text-neutral-500">
                  expires {new Date(inv.expiresAt).toISOString().slice(0, 10)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <RoleBadge role={inv.role} />
                <button
                  type="button"
                  onClick={() => void revoke(inv.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-xs text-neutral-500">No pending invitations.</p>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    OWNER: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    ADMIN: "bg-violet-500/10 text-violet-300 border-violet-500/30",
    EDITOR: "bg-sky-500/10 text-sky-300 border-sky-500/30",
    VIEWER: "bg-neutral-500/10 text-neutral-300 border-neutral-500/30",
  };
  return (
    <span
      className={`rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
        styles[role] ?? styles.VIEWER
      }`}
    >
      {role}
    </span>
  );
}
