export const RESERVATION_INCLUDE = {
  product: { select: { id: true, sku: true, name: true, priceCents: true } },
  warehouse: { select: { id: true, code: true, name: true, region: true } },
} as const;

export const RESERVATION_TTL_MINUTES = 10;
