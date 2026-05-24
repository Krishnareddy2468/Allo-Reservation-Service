/**
 * Idempotency tests for POST /api/reservations.
 *
 * Requires the dev server running on localhost:3000 and a live DB + Redis.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

describe("Idempotency-Key on POST /api/reservations", () => {
  let productId: string;
  let warehouseId: string;

  beforeAll(async () => {
    const warehouse = await prisma.warehouse.upsert({
      where: { code: "IDEM-WH" },
      update: {},
      create: { code: "IDEM-WH", name: "Idempotency Test WH", region: "test" },
    });
    warehouseId = warehouse.id;

    const product = await prisma.product.upsert({
      where: { sku: "TEST-IDEM-SKU" },
      update: {},
      create: { sku: "TEST-IDEM-SKU", name: "Idempotency Test Product", priceCents: 100 },
    });
    productId = product.id;

    await prisma.stockLevel.upsert({
      where: { productId_warehouseId: { productId, warehouseId } },
      update: { totalUnits: 100, reservedUnits: 0 },
      create: { productId, warehouseId, totalUnits: 100, reservedUnits: 0 },
    });
  });

  afterAll(async () => {
    await prisma.reservation.deleteMany({ where: { productId } });
    await prisma.stockLevel.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { sku: "TEST-IDEM-SKU" } });
    await prisma.warehouse.deleteMany({ where: { code: "IDEM-WH" } });
    await prisma.$disconnect();
  });

  it("returns the same response on retry with the same Idempotency-Key", async () => {
    const idempotencyKey = randomUUID();
    const body = JSON.stringify({ productId, warehouseId, quantity: 1 });
    const sessionCookie = `sid=idem-test-${randomUUID()}`;

    const first = await fetch(`${BASE_URL}/api/reservations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        Cookie: sessionCookie,
      },
      body,
    });

    expect(first.status).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.id).toBeDefined();

    // Retry with same key and same body
    const second = await fetch(`${BASE_URL}/api/reservations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        Cookie: sessionCookie,
      },
      body,
    });

    expect(second.status).toBe(201);
    const secondBody = await second.json();

    // The response must be identical — same reservation ID, no new DB row created
    expect(secondBody.id).toBe(firstBody.id);
  });

  it("returns 422 when the same key is reused with a different body", async () => {
    const idempotencyKey = randomUUID();
    const sessionCookie = `sid=idem-test-${randomUUID()}`;

    // First request
    await fetch(`${BASE_URL}/api/reservations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ productId, warehouseId, quantity: 1 }),
    });

    // Retry with same key but different body
    const second = await fetch(`${BASE_URL}/api/reservations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ productId, warehouseId, quantity: 2 }),
    });

    expect(second.status).toBe(422);
    const body = await second.json();
    expect(body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("does not count retried keys against stock", async () => {
    // Set up a product with exactly 1 unit
    const warehouse = await prisma.warehouse.upsert({
      where: { code: "IDEM-STOCK-WH" },
      update: {},
      create: { code: "IDEM-STOCK-WH", name: "Idem Stock WH", region: "test" },
    });
    const product = await prisma.product.upsert({
      where: { sku: "TEST-IDEM-STOCK" },
      update: {},
      create: { sku: "TEST-IDEM-STOCK", name: "Idem Stock Product", priceCents: 100 },
    });
    await prisma.stockLevel.upsert({
      where: {
        productId_warehouseId: { productId: product.id, warehouseId: warehouse.id },
      },
      update: { totalUnits: 1, reservedUnits: 0 },
      create: { productId: product.id, warehouseId: warehouse.id, totalUnits: 1, reservedUnits: 0 },
    });

    const idempotencyKey = randomUUID();
    const body = JSON.stringify({ productId: product.id, warehouseId: warehouse.id, quantity: 1 });
    const sessionCookie = `sid=idem-stock-${randomUUID()}`;

    // First reserve
    const first = await fetch(`${BASE_URL}/api/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey, Cookie: sessionCookie },
      body,
    });
    expect(first.status).toBe(201);

    // Retry — should NOT create another reservation or decrement stock
    const retry = await fetch(`${BASE_URL}/api/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey, Cookie: sessionCookie },
      body,
    });
    expect(retry.status).toBe(201);

    // Stock should still be exactly 1 reserved (not 2)
    const stock = await prisma.stockLevel.findUniqueOrThrow({
      where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
    });
    expect(stock.reservedUnits).toBe(1);

    // Cleanup
    await prisma.reservation.deleteMany({ where: { productId: product.id } });
    await prisma.stockLevel.deleteMany({ where: { productId: product.id } });
    await prisma.product.deleteMany({ where: { sku: "TEST-IDEM-STOCK" } });
    await prisma.warehouse.deleteMany({ where: { code: "IDEM-STOCK-WH" } });

    // Clean up redis key too
    await redis.del(`idem:POST /api/reservations:${idempotencyKey}`);
  });
});
