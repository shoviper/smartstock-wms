export interface SkuSearchProduct {
  sku: string;
  name: string;
}

export function filterProductsBySkuQuery<T extends SkuSearchProduct>(products: T[], query: string): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return products;
  return products.filter((product) =>
    product.sku.toLowerCase().includes(normalizedQuery)
    || product.name.toLowerCase().includes(normalizedQuery),
  );
}
