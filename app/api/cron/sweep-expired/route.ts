import { NextRequest } from "next/server";
import { sweepExpiredReservations } from "@/lib/reservations/sweep";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("Authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sweepExpiredReservations();
  return Response.json(result);
}
