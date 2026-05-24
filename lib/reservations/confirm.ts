import { prisma } from "@/lib/db";
import { RESERVATION_INCLUDE } from "./types";

type Prisma = typeof prisma;
type ReservationWithRelations = Awaited<
  ReturnType<Prisma["reservation"]["update"]>
> & {
  product: { id: string; sku: string; name: string; priceCents: number };
  warehouse: { id: string; code: string; name: string; region: string };
};

export type ConfirmResult =
  | { ok: true; reservation: ReservationWithRelations }
  | { ok: false; reason: "NOT_FOUND" | "NOT_PENDING" | "EXPIRED"; status?: string };

export async function confirmReservation(id: string): Promise<ConfirmResult> {
  try {
    const confirmed = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          status: string;
          expiresAt: Date;
          quantity: number;
          productId: string;
          warehouseId: string;
        }>
      >`
        SELECT id, status, "expiresAt", quantity, "productId", "warehouseId"
        FROM "Reservation" WHERE id = ${id} FOR UPDATE
      `;

      const r = rows[0];
      if (!r) throw Object.assign(new Error(), { code: "NOT_FOUND" });
      if (r.status !== "PENDING")
        throw Object.assign(new Error(), { code: "NOT_PENDING", status: r.status });

      if (r.expiresAt <= new Date()) {
        await tx.$executeRaw`
          UPDATE "StockLevel"
          SET "reservedUnits" = GREATEST("reservedUnits" - ${r.quantity}, 0), "updatedAt" = NOW()
          WHERE "productId" = ${r.productId} AND "warehouseId" = ${r.warehouseId}
        `;
        await tx.reservation.update({ where: { id }, data: { status: "EXPIRED" } });
        throw Object.assign(new Error(), { code: "EXPIRED" });
      }

      await tx.$executeRaw`
        UPDATE "StockLevel"
        SET "totalUnits"    = "totalUnits"    - ${r.quantity},
            "reservedUnits" = "reservedUnits" - ${r.quantity},
            "updatedAt"     = NOW()
        WHERE "productId" = ${r.productId} AND "warehouseId" = ${r.warehouseId}
      `;

      return tx.reservation.update({
        where: { id },
        data: { status: "CONFIRMED" },
        include: RESERVATION_INCLUDE,
      });
    });

    return { ok: true, reservation: confirmed as ReservationWithRelations };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err) {
      const e = err as { code: string; status?: string };
      if (e.code === "NOT_FOUND") return { ok: false, reason: "NOT_FOUND" };
      if (e.code === "NOT_PENDING")
        return { ok: false, reason: "NOT_PENDING", status: e.status };
      if (e.code === "EXPIRED") return { ok: false, reason: "EXPIRED" };
    }
    throw err;
  }
}
