import { NextRequest } from "next/server";
import { getReservation } from "@/lib/reservations/get";
import { apiError, ErrorCodes } from "@/lib/schemas";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const reservation = await getReservation(id);

  if (!reservation) {
    return apiError(ErrorCodes.RESERVATION_NOT_FOUND, "Reservation not found", 404);
  }

  return Response.json(reservation);
}
