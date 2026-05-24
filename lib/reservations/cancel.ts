import { prisma } from "@/lib/db";
import { RESERVATION_INCLUDE } from "./types";

type CancelResult =
  | { ok: true; reservation: unknown }
  | { ok: false; reason: "NOT_FOUND" | "NOT_CANCELLABLE"; status?: string }

export async function cancelReservation(id: string): Promise<CancelResult> {
  try {
    const cancelled = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; status: string; quantity: number; productId: string; warehouseId: string }>
      >`
        SELECT id, status, quantity, "productId", "warehouseId"
        FROM "Reservation" WHERE id = ${id} FOR UPDATE
      `;

      const r = rows[0];
      if (!r) throw Object.assign(new Error(), { code: "NOT_FOUND" });

      // Idempotent: already released
      if (r.status === "RELEASED") {
        return tx.reservation.findUniqueOrThrow({ where: { id }, include: RESERVATION_INCLUDE });
      }

      if (r.status !== "PENDING") {
        throw Object.assign(new Error(), { code: "NOT_CANCELLABLE", status: r.status });
      }

      await tx.$executeRaw`
        UPDATE "StockLevel"
        SET "reservedUnits" = GREATEST("reservedUnits" - ${r.quantity}, 0), "updatedAt" = NOW()
        WHERE "productId" = ${r.productId} AND "warehouseId" = ${r.warehouseId}
      `;

      return tx.reservation.update({
        where: { id },
        data: { status: "RELEASED" },
        include: RESERVATION_INCLUDE,
      });
    });

    return { ok: true, reservation: cancelled };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err) {
      const e = err as { code: string; status?: string };
      if (e.code === "NOT_FOUND") return { ok: false, reason: "NOT_FOUND" };
      if (e.code === "NOT_CANCELLABLE") return { ok: false, reason: "NOT_CANCELLABLE", status: e.status };
    }
    throw err;
  }
}
