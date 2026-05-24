import { ReservationClient } from "./reservation-client";

export default async function ReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReservationClient id={id} />;
}
