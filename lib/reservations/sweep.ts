import { prisma } from "@/lib/db";

/**
 * Bulk-release all PENDING reservations that have passed their expiresAt.
 * Returns the number of reservations swept.
 *
 * Called by /api/cron/sweep-expired every minute.
 * The lazy expiry on GET /api/reservations/[id] handles individual reservations
 * the moment a user views them; this sweep catches the ones nobody is looking at.
 */
export async function sweepExpiredReservations(): Promise<{ swept: number }> {
  return prisma.$transaction(async (tx) => {
    const expired = await tx.reservation.findMany({
      where: { status: "PENDING", expiresAt: { lt: new Date() } },
      select: { id: true, productId: true, warehouseId: true, quantity: true },
    });

    if (expired.length === 0) return { swept: 0 };

    // Group by (productId, warehouseId) to batch stock updates
    const adjustments = new Map<string, { productId: string; warehouseId: string; qty: number }>();
    for (const r of expired) {
      const k = `${r.productId}:${r.warehouseId}`;
      const entry = adjustments.get(k);
      if (entry) {
        entry.qty += r.quantity;
      } else {
        adjustments.set(k, { productId: r.productId, warehouseId: r.warehouseId, qty: r.quantity });
      }
    }

    // Sequential, not Promise.all: a Prisma interactive transaction runs on a
    // single connection, so concurrent queries are unsafe (and serialized at
    // best). Awaiting in order keeps the transaction well-behaved.
    for (const { productId, warehouseId, qty } of adjustments.values()) {
      await tx.$executeRaw`
        UPDATE "StockLevel"
        SET "reservedUnits" = GREATEST("reservedUnits" - ${qty}, 0), "updatedAt" = NOW()
        WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
      `;
    }

    await tx.reservation.updateMany({
      where: { id: { in: expired.map((r) => r.id) } },
      data: { status: "EXPIRED" },
    });

    return { swept: expired.length };
  });
}
