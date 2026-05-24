import { NextRequest } from "next/server";
import { cancelReservation } from "@/lib/reservations/cancel";
import { apiError, ErrorCodes } from "@/lib/schemas";

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
      `Cannot cancel a reservation with status ${result.status?.toLowerCase()}`,
      409,
    );
  }

  return Response.json(result.reservation);
}
