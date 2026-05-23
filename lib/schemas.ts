import { z } from "zod";

// ── Request bodies ────────────────────────────────────────────────────────────

export const ReserveBodySchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.int().min(1).max(100),
});

export const ConfirmBodySchema = z.object({}).optional();

// ── Error response shape ──────────────────────────────────────────────────────

export type ApiError = {
  error: {
    code: string;
    message: string;
  };
};

export function apiError(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } } satisfies ApiError, {
    status,
  });
}

// Well-known error codes the UI branches on
export const ErrorCodes = {
  NOT_ENOUGH_STOCK: "NOT_ENOUGH_STOCK",
  RESERVATION_EXPIRED: "RESERVATION_EXPIRED",
  RESERVATION_NOT_FOUND: "RESERVATION_NOT_FOUND",
  RESERVATION_NOT_PENDING: "RESERVATION_NOT_PENDING",
  LOCK_UNAVAILABLE: "LOCK_UNAVAILABLE",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
} as const;

// ── Custom errors ─────────────────────────────────────────────────────────────

export class NotEnoughStockError extends Error {
  constructor() {
    super("Not enough stock available");
    this.name = "NotEnoughStockError";
  }
}

export class ReservationExpiredError extends Error {
  constructor() {
    super("Reservation has expired");
    this.name = "ReservationExpiredError";
  }
}

export class ReservationNotFoundError extends Error {
  constructor() {
    super("Reservation not found");
    this.name = "ReservationNotFoundError";
  }
}
