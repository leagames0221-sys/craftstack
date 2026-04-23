import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/kb/documents — list ingested documents with chunk counts.
 * Used by the /kb corpus page to show what the retriever can see.
 */
export async function GET() {
  const rows = await prisma.document.findMany({
    select: {
      id: true,
      title: true,
      charCount: true,
      createdAt: true,
      _count: { select: { chunks: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return Response.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      charCount: r.charCount,
      chunks: r._count.chunks,
      createdAt: r.createdAt,
    })),
  );
}

/**
 * DELETE /api/kb/documents?id=... — drop a document and its chunks.
 * Useful during local development; Chunk/Embedding cascade on the FK.
 */
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return Response.json(
      { code: "MISSING_ID", message: "?id= is required" },
      { status: 400 },
    );
  }
  await prisma.document.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
