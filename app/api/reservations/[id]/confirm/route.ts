import { NextRequest } from "next/server";
import { confirmReservation } from "@/lib/reservations/confirm";
import { apiError, ErrorCodes } from "@/lib/schemas";
import { checkIdempotency, saveIdempotencyResult } from "@/lib/idempotency";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const route = `POST /api/reservations/${id}/confirm`;
  const rawBody = "";

  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (idempotencyKey) {
    const cached = await checkIdempotency(route, idempotencyKey, rawBody);
    if (cached === "REUSED") {
      return apiError(
        ErrorCodes.IDEMPOTENCY_KEY_REUSED,
        "Idempotency-Key was already used with a different request body",
        422,
      );
    }
    if (cached) return Response.json(cached.body, { status: cached.status });
  }

  const result = await confirmReservation(id);

  if (!result.ok) {
    if (result.reason === "NOT_FOUND") {
      return apiError(ErrorCodes.RESERVATION_NOT_FOUND, "Reservation not found", 404);
    }
    if (result.reason === "NOT_PENDING") {
      return apiError(
        ErrorCodes.RESERVATION_NOT_PENDING,
        `Reservation is already ${result.status?.toLowerCase()}`,
        409,
      );
    }
    if (result.reason === "EXPIRED") {
      return apiError(
        ErrorCodes.RESERVATION_EXPIRED,
        "Reservation has expired — the hold has been released",
        410,
      );
    }
  }

  const confirmed = (result as { ok: true; reservation: unknown }).reservation;

  if (idempotencyKey) {
    await saveIdempotencyResult(route, idempotencyKey, rawBody, {
      status: 200,
      body: confirmed,
    });
  }

  return Response.json(confirmed);
}
