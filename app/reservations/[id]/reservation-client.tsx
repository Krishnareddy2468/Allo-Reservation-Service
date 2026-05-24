"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiError } from "@/lib/schemas";

type Reservation = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "RELEASED" | "EXPIRED";
  quantity: number;
  expiresAt: string;
  product: { id: string; sku: string; name: string; priceCents: number };
  warehouse: { id: string; code: string; name: string; region: string };
};

const fetcher = (url: string) => fetch(url).then((r) => r.json()) as Promise<Reservation>;

function useCountdown(expiresAt: string | undefined) {
  const [ms, setMs] = useState<number>(() => {
    if (!expiresAt) return 0;
    return Math.max(0, new Date(expiresAt).getTime() - Date.now());
  });

  useEffect(() => {
    if (!expiresAt) return;
    const tick = setInterval(() => {
      setMs(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    }, 250);
    return () => clearInterval(tick);
  }, [expiresAt]);

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return { ms, minutes, seconds, expired: ms === 0 };
}

export function ReservationClient({ id }: { id: string }) {
  const router = useRouter();
  const { data, error, mutate, isLoading } = useSWR<Reservation>(
    `/api/reservations/${id}`,
    fetcher,
    { refreshInterval: 3000 },
  );

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { ms, minutes, seconds, expired: countdownExpired } = useCountdown(data?.expiresAt);

  const confirm = useCallback(async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/reservations/${id}/confirm`, { method: "POST" });
      const body = (await res.json()) as Reservation | ApiError;

      if (res.ok) {
        await mutate(body as Reservation, false);
        return;
      }

      const apiErr = body as ApiError;
      if (res.status === 410) {
        setActionError("Your reservation expired before you could confirm it.");
        await mutate();
      } else {
        setActionError(apiErr.error.message);
      }
    } catch {
      setActionError("Something went wrong. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }, [id, mutate]);

  const cancel = useCallback(async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/reservations/${id}/release`, { method: "POST" });
      const body = (await res.json()) as Reservation | ApiError;

      if (res.ok) {
        await mutate(body as Reservation, false);
        return;
      }

      setActionError((body as ApiError).error.message);
    } catch {
      setActionError("Something went wrong. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }, [id, mutate]);

  if (isLoading) return <LoadingState />;
  if (error || !data) return <NotFoundState />;

  const reservation = data;
  const isPending = reservation.status === "PENDING";
  const isConfirmed = reservation.status === "CONFIRMED";
  const isReleased = reservation.status === "RELEASED";
  const isExpired = reservation.status === "EXPIRED" || (isPending && countdownExpired);

  const formattedPrice = (reservation.product.priceCents / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Button
        variant="outline"
        size="sm"
        className="mb-6"
        onClick={() => router.push("/products")}
      >
        ← Back to products
      </Button>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <CardTitle className="text-xl">{reservation.product.name}</CardTitle>
            <StatusBadge status={reservation.status} isExpired={isExpired} />
          </div>
          <p className="text-muted-foreground text-sm font-mono">{reservation.product.sku}</p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Details */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Warehouse
              </p>
              <p className="mt-1 font-medium">{reservation.warehouse.name}</p>
              <p className="text-muted-foreground text-xs">{reservation.warehouse.region}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Quantity
              </p>
              <p className="mt-1 font-medium">{reservation.quantity}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Total
              </p>
              <p className="mt-1 font-semibold">{formattedPrice}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Reservation ID
              </p>
              <p className="mt-1 font-mono text-xs">{reservation.id}</p>
            </div>
          </div>

          {/* Countdown — only shown for PENDING reservations */}
          {isPending && !isExpired && (
            <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-950">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Hold expires in
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-amber-900 dark:text-amber-100">
                {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-amber-200 dark:bg-amber-800">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-250"
                  style={{
                    width: `${Math.min(100, (ms / (10 * 60 * 1000)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Expired state */}
          {isExpired && (
            <Alert variant="destructive">
              <AlertTitle>Reservation expired</AlertTitle>
              <AlertDescription>
                The 10-minute hold has ended and the unit is now available to other shoppers.
                Go back and reserve again if you still want it.
              </AlertDescription>
            </Alert>
          )}

          {/* Confirmed state */}
          {isConfirmed && (
            <Alert variant="info">
              <AlertTitle>Order confirmed!</AlertTitle>
              <AlertDescription>
                Your purchase is confirmed. The unit has been permanently allocated to you.
              </AlertDescription>
            </Alert>
          )}

          {/* Cancelled state */}
          {isReleased && (
            <Alert variant="warning">
              <AlertTitle>Reservation cancelled</AlertTitle>
              <AlertDescription>
                You cancelled this reservation. The unit is available again.
              </AlertDescription>
            </Alert>
          )}

          {/* Action error banner */}
          {actionError && (
            <Alert variant="destructive">
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}

          {/* Action buttons — only for PENDING and not expired */}
          {isPending && !isExpired && (
            <div className="flex gap-3">
              <Button
                className="flex-1"
                disabled={actionLoading}
                onClick={confirm}
              >
                {actionLoading ? "Processing…" : "Confirm purchase"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={actionLoading}
                onClick={cancel}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Go back after terminal states */}
          {(isExpired || isReleased) && (
            <Button variant="outline" className="w-full" onClick={() => router.push("/products")}>
              Browse products
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function StatusBadge({
  status,
  isExpired,
}: {
  status: string;
  isExpired: boolean;
}) {
  if (isExpired || status === "EXPIRED") {
    return <Badge variant="destructive">Expired</Badge>;
  }
  if (status === "CONFIRMED") {
    return <Badge variant="success">Confirmed</Badge>;
  }
  if (status === "RELEASED") {
    return <Badge variant="outline">Cancelled</Badge>;
  }
  return <Badge variant="warning">Hold active</Badge>;
}

function LoadingState() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-1/2 rounded bg-gray-200" />
        <div className="h-48 rounded-xl bg-gray-200" />
      </div>
    </main>
  );
}

function NotFoundState() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-center">
      <h2 className="text-lg font-semibold">Reservation not found</h2>
      <p className="text-muted-foreground mt-2 text-sm">
        This reservation doesn&apos;t exist or the link is wrong.
      </p>
    </main>
  );
}
