import { prisma } from "@/lib/db";

export async function GET() {
  const warehouses = await prisma.warehouse.findMany({
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, region: true },
  });
  return Response.json(warehouses);
}
