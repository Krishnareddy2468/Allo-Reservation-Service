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
import { checkIdempotency, saveIdempotencyResult } from "@/lib/idempotency";

export async function POST(req: NextRequest) {
  const idempotencyKey = req.headers.get("Idempotency-Key");
  const rawBody = await req.text();

  if (idempotencyKey) {
    const cached = await checkIdempotency("POST /api/reservations", idempotencyKey, rawBody);
    if (cached === "REUSED") {
      return apiError(
        ErrorCodes.IDEMPOTENCY_KEY_REUSED,
        "Idempotency-Key was already used with a different request body",
        422,
      );
    }
    if (cached) return Response.json(cached.body, { status: cached.status });
  }

  let body: z.infer<typeof ReserveBodySchema>;
  try {
    body = ReserveBodySchema.parse(JSON.parse(rawBody));
  } catch {
    return apiError(ErrorCodes.VALIDATION_ERROR, "Invalid request body", 400);
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value ?? "anonymous";

  let reservation;
  try {
    const result = await createReservation({ ...body, sessionId });

    if (result === null) {
      return apiError(
        ErrorCodes.LOCK_UNAVAILABLE,
        "Server is busy — please retry in a moment",
        503,
      );
    }

    reservation = result;
  } catch (err) {
    if (err instanceof NotEnoughStockError) {
      return apiError(ErrorCodes.NOT_ENOUGH_STOCK, "Not enough stock available", 409);
    }
    throw err;
  }

  if (idempotencyKey) {
    await saveIdempotencyResult("POST /api/reservations", idempotencyKey, rawBody, {
      status: 201,
      body: reservation,
    });
  }

  return Response.json(reservation, { status: 201 });
}
