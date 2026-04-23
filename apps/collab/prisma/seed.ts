import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";
import { first, between, last } from "../src/lib/lexorank";

/**
 * Populate the local database with a realistic demo graph.
 * Intended for local dev only. Run with:
 *   pnpm --filter collab exec tsx prisma/seed.ts
 */

const adapter = new PrismaPg({
  connectionString:
    process.env.DIRECT_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgresql://migrator:migrator@localhost:5432/boardly",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("[seed] start");

  const owner = await prisma.user.upsert({
    where: { email: "dev+owner@example.com" },
    update: {},
    create: {
      email: "dev+owner@example.com",
      name: "Demo Owner",
      image: null,
    },
  });
  const editor = await prisma.user.upsert({
    where: { email: "dev+editor@example.com" },
    update: {},
    create: {
      email: "dev+editor@example.com",
      name: "Demo Editor",
      image: null,
    },
  });

  // E2E identities — matched by the CI-only Credentials provider
  // (see src/auth/config.ts). These users are inert unless both
  // E2E_ENABLED=1 and E2E_SHARED_SECRET env vars are present.
  const e2eOwner = await prisma.user.upsert({
    where: { email: "e2e+owner@e2e.example" },
    update: {},
    create: {
      email: "e2e+owner@e2e.example",
      name: "E2E Owner",
      image: null,
    },
  });
  const e2eEditor = await prisma.user.upsert({
    where: { email: "e2e+editor@e2e.example" },
    update: {},
    create: {
      email: "e2e+editor@e2e.example",
      name: "E2E Editor",
      image: null,
    },
  });
  await prisma.user.upsert({
    where: { email: "e2e+viewer@e2e.example" },
    update: {},
    create: {
      email: "e2e+viewer@e2e.example",
      name: "E2E Viewer",
      image: null,
    },
  });

  // Dedicated E2E workspace, deterministic ids so tests can refer to them.
  const e2eWorkspace = await prisma.workspace.upsert({
    where: { slug: "e2e" },
    update: {},
    create: {
      name: "E2E Workspace",
      slug: "e2e",
      ownerId: e2eOwner.id,
      memberships: {
        create: [
          { userId: e2eOwner.id, role: "OWNER" },
          { userId: e2eEditor.id, role: "EDITOR" },
        ],
      },
      labels: {
        create: [
          { name: "e2e-bug", color: "#EF4444" },
          { name: "e2e-feature", color: "#10B981" },
        ],
      },
    },
    include: { labels: true },
  });

  const e2eBoard = await prisma.board.upsert({
    where: { id: `seed-e2e-board` },
    update: {},
    create: {
      id: `seed-e2e-board`,
      workspaceId: e2eWorkspace.id,
      title: "E2E board",
      color: "#6366F1",
      position: first(),
      lists: {
        create: [
          { title: "To do", position: first() },
          { title: "Done", position: last() },
        ],
      },
    },
    include: { lists: true },
  });

  const e2eTodo = e2eBoard.lists.find((l) => l.title === "To do")!;
  await prisma.card.createMany({
    data: [
      { listId: e2eTodo.id, title: "E2E card 1", position: first() },
      {
        listId: e2eTodo.id,
        title: "E2E card 2",
        position: between(first(), last()),
      },
      { listId: e2eTodo.id, title: "E2E card 3", position: last() },
    ],
    skipDuplicates: true,
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      name: "Demo Workspace",
      slug: "demo",
      ownerId: owner.id,
      memberships: {
        create: [
          { userId: owner.id, role: "OWNER" },
          { userId: editor.id, role: "EDITOR" },
        ],
      },
      labels: {
        create: [
          { name: "bug", color: "#EF4444" },
          { name: "feature", color: "#10B981" },
          { name: "docs", color: "#3B82F6" },
        ],
      },
    },
    include: { labels: true },
  });

  const board = await prisma.board.upsert({
    where: { id: `seed-board-${workspace.id}` },
    update: {},
    create: {
      id: `seed-board-${workspace.id}`,
      workspaceId: workspace.id,
      title: "Welcome board",
      color: "#6366F1",
      position: first(),
      lists: {
        create: [
          { title: "To do", position: first() },
          { title: "In progress", position: between(first(), last()) },
          { title: "Done", position: last() },
        ],
      },
    },
    include: { lists: true },
  });

  const todo = board.lists.find((l) => l.title === "To do")!;
  await prisma.card.createMany({
    data: [
      {
        listId: todo.id,
        title: "Read the README",
        position: first(),
      },
      {
        listId: todo.id,
        title: "Invite a teammate",
        position: between(first(), last()),
      },
      {
        listId: todo.id,
        title: "Drag a card into In progress",
        position: last(),
      },
    ],
    skipDuplicates: true,
  });

  console.log("[seed] done");
  console.log(`  user:      ${owner.email}`);
  console.log(`  workspace: /${workspace.slug}`);
  console.log(`  board:     ${board.title}`);
}

main()
  .catch((err) => {
    console.error("[seed] failed", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
