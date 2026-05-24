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
    {
      sku: "LAPTOP-APPLE-MBP-M3",
      name: "MacBook Pro 14\" M3",
      description: "Apple M3 chip, 18GB RAM, 512GB SSD. Blazing fast for creative work.",
      priceCents: 19999900,
      stock: [
        { warehouse: mumbai, total: 7, reserved: 0 },
        { warehouse: bangalore, total: 5, reserved: 0 },
      ],
    },
    {
      sku: "PERFUME-SAUVAGE-100",
      name: "Dior Sauvage EDP 100ml",
      description: "Fresh and woody. One of the best-selling fragrances worldwide.",
      priceCents: 1099900,
      stock: [
        { warehouse: mumbai, total: 15, reserved: 0 },
        { warehouse: bangalore, total: 10, reserved: 0 },
      ],
    },
    {
      sku: "JEANS-LEVIS-511-32",
      name: "Levi's 511 Slim Jeans (32x32)",
      description: "Classic slim fit denim, sits below waist.",
      priceCents: 399900,
      stock: [
        { warehouse: mumbai, total: 20, reserved: 0 },
        { warehouse: bangalore, total: 18, reserved: 0 },
      ],
    },
    {
      sku: "SPEAKER-BOSE-SB700",
      name: "Bose SoundLink Max",
      description: "Portable Bluetooth speaker with 360° sound and 20hr battery.",
      priceCents: 3499900,
      stock: [
        { warehouse: mumbai, total: 8, reserved: 0 },
        { warehouse: bangalore, total: 6, reserved: 0 },
      ],
    },
    {
      sku: "TABLET-IPAD-AIR-M2",
      name: "iPad Air M2 (11\")",
      description: "Powerful M2 chip, 128GB, Wi-Fi. Perfect for work and creativity.",
      priceCents: 7499900,
      stock: [
        { warehouse: mumbai, total: 10, reserved: 0 },
        { warehouse: bangalore, total: 7, reserved: 0 },
      ],
    },
    {
      sku: "SUNGLASSES-RAY-WAYFARER",
      name: "Ray-Ban Wayfarer Classic",
      description: "Iconic acetate frame with G-15 lenses. UV400 protection.",
      priceCents: 1599900,
      stock: [
        { warehouse: mumbai, total: 14, reserved: 0 },
        { warehouse: bangalore, total: 9, reserved: 0 },
      ],
    },
    {
      sku: "COFFEE-BLUET-250G",
      name: "Blue Tokai Vienna Roast 250g",
      description: "Single-origin Arabica from Coorg. Medium roast, notes of dark chocolate.",
      priceCents: 74900,
      stock: [
        { warehouse: mumbai, total: 40, reserved: 0 },
        { warehouse: bangalore, total: 60, reserved: 0 },
      ],
    },
    {
      sku: "BACKPACK-WILDCRAFT-30L",
      name: "Wildcraft Alpha 30L Backpack",
      description: "30L capacity, laptop sleeve, water-resistant. Great for daily commute.",
      priceCents: 349900,
      stock: [
        { warehouse: mumbai, total: 22, reserved: 0 },
        { warehouse: bangalore, total: 17, reserved: 0 },
      ],
    },
    {
      sku: "SNEAKER-ADIDAS-STAN-42",
      name: "Adidas Stan Smith (UK 8)",
      description: "Timeless leather sneaker. Clean, minimal, goes with everything.",
      priceCents: 899900,
      stock: [
        { warehouse: mumbai, total: 9, reserved: 0 },
        { warehouse: bangalore, total: 11, reserved: 0 },
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
        { warehouse: mumbai, total: 1, reserved: 0 }, // ← 1-unit SKU for 409 demo
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
