"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiError } from "@/lib/schemas";

type StockLevel = {
  id: string;
  warehouseId: string;
  totalUnits: number;
  reservedUnits: number;
  available: number;
  warehouse: { id: string; code: string; name: string; region: string };
};

type Product = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  priceCents: number;
  stockLevels: StockLevel[];
};

export function ProductCard({ product }: { product: Product }) {
  const router = useRouter();
  const [reserving, setReserving] = useState<string | null>(null); // warehouseId
  const [error, setError] = useState<string | null>(null);

  async function reserve(warehouseId: string) {
    setReserving(warehouseId);
    setError(null);

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, warehouseId, quantity: 1 }),
      });

      if (res.status === 201) {
        const data = (await res.json()) as { id: string };
        router.push(`/reservations/${data.id}`);
        return;
      }

      const data = (await res.json()) as ApiError;
      if (data.error.code === "NOT_ENOUGH_STOCK") {
        setError("Sorry, that unit just sold out. Try another warehouse.");
      } else {
        setError(data.error.message);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setReserving(null);
    }
  }

  const formattedPrice = (product.priceCents / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{product.name}</CardTitle>
            <CardDescription className="mt-0.5 font-mono text-xs">{product.sku}</CardDescription>
          </div>
          <span className="text-base font-semibold whitespace-nowrap">{formattedPrice}</span>
        </div>
        {product.description && (
          <p className="text-muted-foreground mt-2 text-xs">{product.description}</p>
        )}
      </CardHeader>

      <CardContent className="flex-1 pb-3">
        {error && (
          <Alert variant="destructive" className="mb-3 py-2 text-sm">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Stock by warehouse
          </p>
          {product.stockLevels.length === 0 ? (
            <p className="text-muted-foreground text-sm">No stock information.</p>
          ) : (
            product.stockLevels.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <div>
                  <span className="font-medium">{s.warehouse.name}</span>
                  <span className="text-muted-foreground ml-1 text-xs">({s.warehouse.region})</span>
                </div>
                <Badge
                  variant={s.available > 5 ? "success" : s.available > 0 ? "warning" : "destructive"}
                >
                  {s.available > 0 ? `${s.available} left` : "Out of stock"}
                </Badge>
              </div>
            ))
          )}
        </div>
      </CardContent>

      <CardFooter className="flex flex-col gap-2 pt-3">
        {product.stockLevels
          .filter((s) => s.available > 0)
          .map((s) => (
            <Button
              key={s.warehouseId}
              className="w-full"
              size="sm"
              disabled={reserving !== null}
              onClick={() => reserve(s.warehouseId)}
            >
              {reserving === s.warehouseId
                ? "Reserving…"
                : `Reserve from ${s.warehouse.name}`}
            </Button>
          ))}
        {product.stockLevels.every((s) => s.available === 0) && (
          <p className="text-muted-foreground w-full text-center text-sm">Out of stock everywhere</p>
        )}
      </CardFooter>
    </Card>
  );
}
