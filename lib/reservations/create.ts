import { prisma } from "@/lib/db";
import { withLock } from "@/lib/lock";
import { NotEnoughStockError } from "@/lib/schemas";
import { RESERVATION_INCLUDE, RESERVATION_TTL_MINUTES } from "./types";

export async function createReservation({
  productId,
  warehouseId,
  quantity,
  sessionId,
}: {
  productId: string;
  warehouseId: string;
  quantity: number;
  sessionId: string;
}) {
  const lockKey = `stock:${productId}:${warehouseId}`;

  const result = await withLock(lockKey, async () => {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.$executeRaw`
        UPDATE "StockLevel"
        SET "reservedUnits" = "reservedUnits" + ${quantity},
            "updatedAt"     = NOW()
        WHERE "productId"   = ${productId}
          AND "warehouseId" = ${warehouseId}
          AND ("totalUnits" - "reservedUnits") >= ${quantity}
      `;

      if (updated === 0) throw new NotEnoughStockError();

      const expiresAt = new Date(
        Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000,
      );

      return tx.reservation.create({
        data: { productId, warehouseId, sessionId, quantity, expiresAt },
        include: RESERVATION_INCLUDE,
      });
    });
  });

  // null = lock unavailable
  return result;
}
