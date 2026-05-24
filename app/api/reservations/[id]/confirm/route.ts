import { NextRequest } from "next/server";
import { confirmReservation } from "@/lib/reservations/confirm";
import { apiError, ErrorCodes } from "@/lib/schemas";
import {
  checkIdempotency,
  saveIdempotencyResult,
  releaseIdempotencyInFlight,
} from "@/lib/idempotency";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const route = `POST /api/reservations/${id}/confirm`;
  const rawBody = "";

  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (idempotencyKey) {
    const outcome = await checkIdempotency(route, idempotencyKey, rawBody);
    if (outcome.kind === "reused") {
      return apiError(
        ErrorCodes.IDEMPOTENCY_KEY_REUSED,
        "Idempotency-Key was already used with a different request body",
        422,
      );
    }
    if (outcome.kind === "cached") {
      return Response.json(outcome.body, { status: outcome.status });
    }
    if (outcome.kind === "in_progress") {
      return apiError(
        ErrorCodes.LOCK_UNAVAILABLE,
        "An identical request is still in progress — please retry shortly",
        409,
      );
    }
  }

  let result;
  try {
    result = await confirmReservation(id);
  } catch (err) {
    if (idempotencyKey) await releaseIdempotencyInFlight(route, idempotencyKey);
    throw err;
  }

  if (!result.ok) {
    if (idempotencyKey) await releaseIdempotencyInFlight(route, idempotencyKey);
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
