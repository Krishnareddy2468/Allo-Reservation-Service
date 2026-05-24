import { prisma } from "@/lib/db";
import { RESERVATION_INCLUDE } from "./types";

/**
 * Fetch a reservation by id, lazily expiring it if PENDING + past expiresAt.
 * Returns null if not found.
 */
export async function getReservation(id: string) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id },
      include: RESERVATION_INCLUDE,
    });

    if (!reservation) return null;

    if (reservation.status === "PENDING" && reservation.expiresAt <= new Date()) {
      await tx.$executeRaw`
        UPDATE "StockLevel"
        SET "reservedUnits" = GREATEST("reservedUnits" - ${reservation.quantity}, 0),
            "updatedAt"     = NOW()
        WHERE "productId"   = ${reservation.productId}
          AND "warehouseId" = ${reservation.warehouseId}
      `;

      return tx.reservation.update({
        where: { id },
        data: { status: "EXPIRED" },
        include: RESERVATION_INCLUDE,
      });
    }

    return reservation;
  });
}
