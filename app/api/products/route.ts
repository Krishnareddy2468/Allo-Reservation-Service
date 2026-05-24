import { prisma } from "@/lib/db";

export async function GET() {
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: {
      stockLevels: {
        include: {
          warehouse: {
            select: { id: true, code: true, name: true, region: true },
          },
        },
        orderBy: { warehouse: { name: "asc" } },
      },
    },
  });

  // Compute available = total - reserved at the API layer so clients
  // don't need to do the arithmetic
  const result = products.map((p) => ({
    ...p,
    stockLevels: p.stockLevels.map((s) => ({
      ...s,
      available: s.totalUnits - s.reservedUnits,
    })),
  }));

  return Response.json(result);
}
