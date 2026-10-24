import { describe, expect, it } from 'vitest';
import { filterProductsBySkuQuery } from './skuSearch';

const products = [
  { sku: 'SKU-004', name: 'Blue Widget' },
  { sku: 'SKU-021', name: 'Copy Paper' },
  { sku: 'BOX-01', name: 'Widget Storage Box' },
];

describe('filterProductsBySkuQuery', () => {
  it('matches SKU or product name without case sensitivity', () => {
    expect(filterProductsBySkuQuery(products, 'sku-004').map(({ sku }) => sku)).toEqual(['SKU-004']);
    expect(filterProductsBySkuQuery(products, 'COPY').map(({ sku }) => sku)).toEqual(['SKU-021']);
    expect(filterProductsBySkuQuery(products, 'widget').map(({ sku }) => sku)).toEqual(['SKU-004', 'BOX-01']);
  });

  it('returns all products for an empty query and none for no match', () => {
    expect(filterProductsBySkuQuery(products, '  ')).toEqual(products);
    expect(filterProductsBySkuQuery(products, 'missing')).toEqual([]);
  });
});
