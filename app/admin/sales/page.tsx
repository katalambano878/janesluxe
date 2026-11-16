'use client';

import ProductMarkdowns from '@/components/admin/ProductMarkdowns';

export default function AdminSalesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Sale &amp; discounts</h1>
        <p className="text-gray-600 mt-1">Mark down selected products. Shoppers see the old price crossed out; ending a markdown restores exact prices.</p>
      </div>
      <ProductMarkdowns />
    </div>
  );
}