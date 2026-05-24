/**
 * Concurrency test: the critical correctness check.
 *
 * Seeds a StockLevel with exactly 1 unit, then fires 50 parallel POST
 * /api/reservations requests for that unit. Exactly one should get 201;
 * the rest should get 409. No double-booking.
 *
 * Run: pnpm test (needs the dev server running on localhost:3000 and a live DB).
 * The test cleans up after itself so it can be re-run.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const CONCURRENCY = 50;

describe("POST /api/reservations — concurrent reserve on last unit", () => {
  let productId: string;
  let warehouseId: string;

  beforeAll(async () => {
    // Upsert a test warehouse and product so the test is self-contained
    const warehouse = await prisma.warehouse.upsert({
      where: { code: "TEST-WH" },
      update: {},
      create: { code: "TEST-WH", name: "Test Warehouse", region: "test" },
    });
    warehouseId = warehouse.id;

    const product = await prisma.product.upsert({
      where: { sku: "TEST-CONCURRENT-SKU" },
      update: {},
      create: {
        sku: "TEST-CONCURRENT-SKU",
        name: "Concurrent Test Product",
        priceCents: 100,
      },
    });
    productId = product.id;

    // Exactly 1 unit available
    await prisma.stockLevel.upsert({
      where: { productId_warehouseId: { productId, warehouseId } },
      update: { totalUnits: 1, reservedUnits: 0 },
      create: { productId, warehouseId, totalUnits: 1, reservedUnits: 0 },
    });
  });

  afterAll(async () => {
    // Clean up reservations, stock, product, warehouse created by this test
    await prisma.reservation.deleteMany({ where: { productId } });
    await prisma.stockLevel.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { sku: "TEST-CONCURRENT-SKU" } });
    await prisma.warehouse.deleteMany({ where: { code: "TEST-WH" } });
    await prisma.$disconnect();
  });

  it("allows exactly one reservation when 50 requests race for the last unit", async () => {
    const requests = Array.from({ length: CONCURRENCY }, () =>
      fetch(`${BASE_URL}/api/reservations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Give each request a distinct fake session so they don't share cookies
          Cookie: `sid=test-session-${Math.random().toString(36).slice(2)}`,
        },
        body: JSON.stringify({ productId, warehouseId, quantity: 1 }),
      }).then((r) => r.status),
    );

    const statuses = await Promise.all(requests);

    const successes = statuses.filter((s) => s === 201);
    const conflicts = statuses.filter((s) => s === 409);

    console.log(
      `Results: ${successes.length} succeeded, ${conflicts.length} got 409, ${
        statuses.filter((s) => s !== 201 && s !== 409).length
      } other`,
    );

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(CONCURRENCY - 1);

    // Double-check the DB is in a consistent state: reservedUnits === 1
    const stock = await prisma.stockLevel.findUniqueOrThrow({
      where: { productId_warehouseId: { productId, warehouseId } },
    });
    expect(stock.reservedUnits).toBe(1);
    expect(stock.totalUnits - stock.reservedUnits).toBe(0);
  });
});
