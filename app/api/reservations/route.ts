import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { z } from "zod";
import { createReservation } from "@/lib/reservations/create";
import {
  ReserveBodySchema,
  apiError,
  ErrorCodes,
  NotEnoughStockError,
} from "@/lib/schemas";
import { SESSION_COOKIE } from "@/middleware";
import {
  checkIdempotency,
  saveIdempotencyResult,
  releaseIdempotencyInFlight,
} from "@/lib/idempotency";

const ROUTE = "POST /api/reservations";

export async function POST(req: NextRequest) {
  const idempotencyKey = req.headers.get("Idempotency-Key");
  const rawBody = await req.text();

  if (idempotencyKey) {
    const outcome = await checkIdempotency(ROUTE, idempotencyKey, rawBody);
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
    // outcome.kind === "proceed": we own the in-flight slot
  }

  let body: z.infer<typeof ReserveBodySchema>;
  try {
    body = ReserveBodySchema.parse(JSON.parse(rawBody));
  } catch {
    if (idempotencyKey) await releaseIdempotencyInFlight(ROUTE, idempotencyKey);
    return apiError(ErrorCodes.VALIDATION_ERROR, "Invalid request body", 400);
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value ?? "anonymous";

  let reservation;
  try {
    const result = await createReservation({ ...body, sessionId });

    if (result === null) {
      if (idempotencyKey) await releaseIdempotencyInFlight(ROUTE, idempotencyKey);
      return apiError(
        ErrorCodes.LOCK_UNAVAILABLE,
        "Server is busy — please retry in a moment",
        503,
      );
    }

    reservation = result;
  } catch (err) {
    if (err instanceof NotEnoughStockError) {
      if (idempotencyKey) await releaseIdempotencyInFlight(ROUTE, idempotencyKey);
      return apiError(ErrorCodes.NOT_ENOUGH_STOCK, "Not enough stock available", 409);
    }
    if (idempotencyKey) await releaseIdempotencyInFlight(ROUTE, idempotencyKey);
    throw err;
  }

  if (idempotencyKey) {
    await saveIdempotencyResult(ROUTE, idempotencyKey, rawBody, {
      status: 201,
      body: reservation,
    });
  }

  return Response.json(reservation, { status: 201 });
}
