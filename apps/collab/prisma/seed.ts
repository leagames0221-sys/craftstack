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
      avatarUrl: null,
    },
  });
  const editor = await prisma.user.upsert({
    where: { email: "dev+editor@example.com" },
    update: {},
    create: {
      email: "dev+editor@example.com",
      name: "Demo Editor",
      avatarUrl: null,
    },
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
