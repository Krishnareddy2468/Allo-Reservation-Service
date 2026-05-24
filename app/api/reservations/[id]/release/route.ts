import { NextRequest } from "next/server";
import { cancelReservation } from "@/lib/reservations/cancel";
import { apiError, ErrorCodes } from "@/lib/schemas";

// Spec endpoint: POST /api/reservations/:id/release
// "Release the reservation early (payment failed or user cancelled)."
//
// Internally this is the same operation as `/cancel` — the verb in our domain
// is "release the held units back to available stock". /cancel is kept as an
// alias for backwards compatibility with earlier UI calls.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await cancelReservation(id);

  if (!result.ok) {
    if (result.reason === "NOT_FOUND") {
      return apiError(ErrorCodes.RESERVATION_NOT_FOUND, "Reservation not found", 404);
    }
    return apiError(
      ErrorCodes.RESERVATION_NOT_PENDING,
      `Cannot release a reservation with status ${result.status?.toLowerCase()}`,
      409,
    );
  }

  return Response.json(result.reservation);
}
