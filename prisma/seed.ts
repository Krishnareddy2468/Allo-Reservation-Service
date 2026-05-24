import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ── Warehouses ──────────────────────────────────────────────────────────────
  const mumbai = await prisma.warehouse.upsert({
    where: { code: "MUM" },
    update: {},
    create: { code: "MUM", name: "Mumbai", region: "West India" },
  });

  const bangalore = await prisma.warehouse.upsert({
    where: { code: "BLR" },
    update: {},
    create: { code: "BLR", name: "Bangalore", region: "South India" },
  });

  console.log("Warehouses:", mumbai.name, bangalore.name);

  // ── Products ────────────────────────────────────────────────────────────────
  const products = [
    {
      sku: "SHOE-NK-AIR-42",
      name: "Nike Air Max 270",
      description: "Comfortable everyday sneaker with Max Air cushioning.",
      priceCents: 1299900,
      stock: [
        { warehouse: mumbai, total: 12, reserved: 0 },
        { warehouse: bangalore, total: 8, reserved: 0 },
      ],
    },
    {
      sku: "SHIRT-LS-WHITE-M",
      name: "Linen Shirt (White, M)",
      description: "Breathable 100% linen shirt, perfect for the Indian summer.",
      priceCents: 249900,
      stock: [
        { warehouse: mumbai, total: 25, reserved: 0 },
        { warehouse: bangalore, total: 30, reserved: 0 },
      ],
    },
    {
      sku: "HEADPHONE-SONY-WH1000",
      name: "Sony WH-1000XM5",
      description: "Industry-leading noise cancelling over-ear headphones.",
      priceCents: 2999900,
      stock: [
        { warehouse: mumbai, total: 5, reserved: 0 },
        { warehouse: bangalore, total: 3, reserved: 0 },
      ],
    },
    {
      sku: "BOOK-DUNE-HC",
      name: "Dune (Hardcover)",
      description: "Frank Herbert's science fiction masterpiece.",
      priceCents: 129900,
      stock: [
        { warehouse: mumbai, total: 50, reserved: 0 },
        { warehouse: bangalore, total: 40, reserved: 0 },
      ],
    },
    {
      sku: "WATCH-TITAN-AUTO-01",
      name: "Titan Automatic Watch",
      description: "Elegant automatic movement, sapphire crystal glass.",
      priceCents: 1499900,
      stock: [
        { warehouse: mumbai, total: 3, reserved: 0 },
        { warehouse: bangalore, total: 2, reserved: 0 },
      ],
    },
    // The critical product for demos: exactly 1 unit in Mumbai, so the
    // 409 race condition can be demonstrated live by opening two browser tabs.
    {
      sku: "CAMERA-FUJI-X100VI-1U",
      name: "Fujifilm X100VI (Last Unit)",
      description:
        "40MP APS-C sensor, in-body stabilisation. Only 1 left in Mumbai — try the 409 race condition!",
      priceCents: 12999900,
      stock: [
        { warehouse: mumbai, total: 1, reserved: 0 },   // ← the 1-unit SKU for 409 demo
        { warehouse: bangalore, total: 4, reserved: 0 },
      ],
    },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: { name: p.name, description: p.description, priceCents: p.priceCents },
      create: { sku: p.sku, name: p.name, description: p.description, priceCents: p.priceCents },
    });

    for (const s of p.stock) {
      await prisma.stockLevel.upsert({
        where: { productId_warehouseId: { productId: product.id, warehouseId: s.warehouse.id } },
        update: { totalUnits: s.total, reservedUnits: s.reserved },
        create: {
          productId: product.id,
          warehouseId: s.warehouse.id,
          totalUnits: s.total,
          reservedUnits: s.reserved,
        },
      });
    }

    console.log(`  ✓ ${product.name}`);
  }

  console.log("\nSeed complete. The Fujifilm X100VI has only 1 unit in Mumbai — good for 409 demos.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
