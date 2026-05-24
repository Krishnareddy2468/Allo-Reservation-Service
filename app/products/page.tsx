import { prisma } from "@/lib/db";
import { ProductCard } from "./product-card";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getProducts() {
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: {
      stockLevels: {
        include: {
          warehouse: { select: { id: true, code: true, name: true, region: true } },
        },
        orderBy: { warehouse: { name: "asc" } },
      },
    },
  });

  return products.map((p) => ({
    ...p,
    stockLevels: p.stockLevels.map((s) => ({
      ...s,
      available: s.totalUnits - s.reservedUnits,
    })),
  }));
}

export default async function ProductsPage() {
  const products = await getProducts();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Products</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Reserve a unit to hold it for 10 minutes while you check out.
        </p>
      </div>

      {products.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-12 text-center text-sm">
          No products yet. Run <code className="font-mono">pnpm db:seed</code> to add some.
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </main>
  );
}
