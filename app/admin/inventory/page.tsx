'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAdminBranch } from '@/context/AdminBranchContext';
import { downloadCsv, parseCsv, todayStamp } from '@/lib/csv';
import { formatPrice } from '@/lib/format-price';

type Variant = { id: string; name: string; sku: string; quantity: number };
type StockStatus = 'good' | 'low' | 'out';
type StockFilter = 'all' | 'low' | 'out' | 'good';

type InventoryItem = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  category: string;
  currentStock: number;
  tracked: boolean;
  threshold: number;
  price: number;
  status: StockStatus;
  variants: Variant[];
  branchBreakdown: { name: string; quantity: number }[];
};

type StockChange = {
  kind: 'product' | 'variant';
  id: string;
  productId: string;
  label: string;
  from: number;
  to: number;
};

type ImportPreview = {
  fileName: string;
  changes: StockChange[];
  unchanged: number;
  problems: string[];
};

const FILTERS: { key: StockFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'low', label: 'Low Stock' },
  { key: 'out', label: 'Out' },
  { key: 'good', label: 'In Stock' },
];

function stockStatus(stock: number, tracked: boolean, threshold: number): StockStatus {
  if (!tracked) return 'good';
  if (stock <= 0) return 'out';
  if (stock <= threshold) return 'low';
  return 'good';
}

export default function InventoryManagementPage() {
  const { selectedBranch, branches, loading: branchLoading } = useAdminBranch();
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [products, setProducts] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const [showImport, setShowImport] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showRestock, setShowRestock] = useState(false);
  const [restockMode, setRestockMode] = useState<'add' | 'set'>('add');
  const [restockValues, setRestockValues] = useState<Record<string, string>>({});
  const [restockFill, setRestockFill] = useState('');

  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/products?sortBy=name&limit=1000', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load inventory');

      const mapped: InventoryItem[] = (Array.isArray(data) ? data : [])
        .filter((p: { status?: string }) => p.status !== 'archived')
        .map((p: any) => {
          const branchRows: any[] = p.branch_inventory || [];
          const branchRow = selectedBranch
            ? branchRows.find((r: any) => r.branch_id === selectedBranch.id)
            : null;
          const stock = selectedBranch
            ? (branchRow ? Number(branchRow.quantity) || 0 : Number(p.quantity) || 0)
            : (Number(p.quantity) || 0);
          const tracked = p.track_quantity !== false;
          const threshold = Number(p.metadata?.low_stock_threshold) || 5;
          const variants: Variant[] = Array.isArray(p.product_variants)
            ? p.product_variants.map((v: any) => ({
                id: v.id,
                name: v.name || 'Variant',
                sku: v.sku || '',
                quantity: Number(v.quantity) || 0,
              }))
            : [];
          return {
            id: p.id,
            name: p.name,
            slug: p.slug || '',
            sku: p.sku || '',
            category: p.category || p.categories?.name || 'Uncategorized',
            currentStock: stock,
            tracked,
            threshold,
            price: Number(p.price) || 0,
            status: stockStatus(stock, tracked, threshold),
            variants,
            branchBreakdown: branches
              .filter((b) => b.is_active)
              .map((b) => ({
                name: b.name,
                quantity: Number(branchRows.find((r: any) => r.branch_id === b.id)?.quantity) || 0,
              })),
          };
        });
      setProducts(mapped);
      setSelectedProducts((prev) => prev.filter((id) => mapped.some((p) => p.id === id)));
    } catch (error) {
      console.error('Error fetching inventory:', error);
      setNotice({ tone: 'error', text: 'Could not load the inventory. Reload the page to try again.' });
    } finally {
      setLoading(false);
    }
  }, [selectedBranch, branches]);

  useEffect(() => {
    if (branchLoading) return;
    fetchInventory();
  }, [branchLoading, fetchInventory]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const counts = useMemo(
    () => ({
      all: products.length,
      low: products.filter((p) => p.status === 'low').length,
      out: products.filter((p) => p.status === 'out').length,
      good: products.filter((p) => p.status === 'good').length,
    }),
    [products]
  );

  const totalValue = useMemo(
    () => products.reduce((sum, p) => sum + (p.currentStock * p.price || 0), 0),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch =
        !q ||
        product.name.toLowerCase().includes(q) ||
        product.sku.toLowerCase().includes(q) ||
        product.variants.some((v) => v.sku.toLowerCase().includes(q));
      return matchesSearch && (stockFilter === 'all' || product.status === stockFilter);
    });
  }, [products, searchTerm, stockFilter]);

  const allVisibleSelected =
    filteredProducts.length > 0 && filteredProducts.every((p) => selectedProducts.includes(p.id));

  const emptyText = searchTerm.trim()
    ? `No products match "${searchTerm.trim()}".`
    : stockFilter === 'out'
      ? 'No products are out of stock.'
      : stockFilter === 'low'
        ? 'No products are low on stock.'
        : 'No products match this filter.';

  const applyStockChanges = async (changes: StockChange[]) => {
    if (changes.length === 0) return false;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/inventory/adjust', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: selectedBranch?.id || null,
          changes: changes.map(({ kind, id, productId, to }) => ({ kind, id, productId, to })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not update stock');
      await fetchInventory();
      setNotice({
        tone: 'ok',
        text: `Updated stock for ${changes.length} ${changes.length === 1 ? 'item' : 'items'}.`,
      });
      return true;
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not update stock' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveBranchStock = async (productId: string) => {
    if (!selectedBranch) return;
    const quantity = parseInt(editValue, 10);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setNotice({ tone: 'error', text: 'Enter a whole number, zero or more.' });
      return;
    }
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setSavingId(productId);
    const ok = await applyStockChanges([
      { kind: 'product', id: productId, productId, label: product.name, from: product.currentStock, to: quantity },
    ]);
    setSavingId(null);
    if (ok) setEditingId(null);
  };

  const handleExportCSV = () => {
    const rows: unknown[][] = [
      ['Type', 'Product', 'Variant', 'SKU', 'Category', 'Stock', 'Price', 'Retail Value', 'Status'],
    ];
    for (const p of filteredProducts) {
      const statusLabel = !p.tracked ? 'Not tracked' : p.status === 'out' ? 'Out of Stock' : p.status === 'low' ? 'Low Stock' : 'In Stock';
      rows.push(['Product', p.name, '', p.sku, p.category, p.currentStock, p.price.toFixed(2), (p.currentStock * p.price).toFixed(2), statusLabel]);
      if (!selectedBranch) {
        for (const v of p.variants) {
          rows.push(['Variant', p.name, v.name, v.sku, p.category, v.quantity, '', '', '']);
        }
      }
    }
    downloadCsv(`inventory-${stockFilter}-${todayStamp()}.csv`, rows);
  };

  const readImportFile = async (file: File | undefined) => {
    setImportPreview(null);
    setImportError(null);
    if (!file) return;
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) {
        setImportError('The file has no rows under the header.');
        return;
      }
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const skuCol = header.findIndex((h) => h === 'sku');
      const stockCol = ['new stock', 'stock', 'quantity', 'qty', 'current stock'].reduce<number>(
        (found, name) => (found >= 0 ? found : header.indexOf(name)),
        -1
      );
      if (skuCol < 0 || stockCol < 0) {
        setImportError(`The file needs a SKU column and a Stock column. Found: ${rows[0].filter(Boolean).join(', ') || 'no header'}.`);
        return;
      }

      const productBySku = new Map<string, InventoryItem>();
      const variantBySku = new Map<string, { variant: Variant; product: InventoryItem }>();
      for (const p of products) {
        if (p.sku) productBySku.set(p.sku.trim().toLowerCase(), p);
        if (!selectedBranch) {
          for (const v of p.variants) {
            if (v.sku) variantBySku.set(v.sku.trim().toLowerCase(), { variant: v, product: p });
          }
        }
      }

      const changes: StockChange[] = [];
      const problems: string[] = [];
      const seen = new Set<string>();
      let unchanged = 0;

      rows.slice(1).forEach((row, index) => {
        const lineNo = index + 2;
        const sku = (row[skuCol] || '').trim();
        const rawStock = (row[stockCol] || '').trim();
        if (!sku || rawStock === '') return;
        const stock = Number(rawStock.replace(/,/g, ''));
        if (!Number.isInteger(stock) || stock < 0) {
          problems.push(`Line ${lineNo}: "${rawStock}" is not a whole number for ${sku}.`);
          return;
        }
        const key = sku.toLowerCase();
        if (seen.has(key)) {
          problems.push(`Line ${lineNo}: ${sku} appears more than once. Only the first row is used.`);
          return;
        }
        seen.add(key);

        const variantHit = variantBySku.get(key);
        if (variantHit) {
          if (variantHit.variant.quantity === stock) unchanged++;
          else {
            changes.push({
              kind: 'variant',
              id: variantHit.variant.id,
              productId: variantHit.product.id,
              label: `${variantHit.product.name} / ${variantHit.variant.name}`,
              from: variantHit.variant.quantity,
              to: stock,
            });
          }
          return;
        }
        const product = productBySku.get(key);
        if (!product) {
          problems.push(`Line ${lineNo}: no product has the SKU ${sku}.`);
          return;
        }
        if (!selectedBranch && product.variants.length > 0) {
          problems.push(`Line ${lineNo}: ${product.name} has variants. Set each variant SKU instead.`);
          return;
        }
        if (product.currentStock === stock) unchanged++;
        else {
          changes.push({
            kind: 'product',
            id: product.id,
            productId: product.id,
            label: product.name,
            from: product.currentStock,
            to: stock,
          });
        }
      });
      setImportPreview({ fileName: file.name, changes, unchanged, problems });
    } catch {
      setImportError('Could not read that file. Save it as CSV and try again.');
    }
  };

  const confirmImport = async () => {
    if (!importPreview || importPreview.changes.length === 0) return;
    const ok = await applyStockChanges(importPreview.changes);
    if (ok) {
      setShowImport(false);
      setImportPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const restockRows = useMemo(() => {
    const rows: { key: string; change: Omit<StockChange, 'to'> }[] = [];
    for (const p of products) {
      if (!selectedProducts.includes(p.id)) continue;
      if (!selectedBranch && p.variants.length > 0) {
        for (const v of p.variants) {
          rows.push({
            key: `variant:${v.id}`,
            change: { kind: 'variant', id: v.id, productId: p.id, label: `${p.name} / ${v.name}`, from: v.quantity },
          });
        }
      } else {
        rows.push({
          key: `product:${p.id}`,
          change: { kind: 'product', id: p.id, productId: p.id, label: p.name, from: p.currentStock },
        });
      }
    }
    return rows;
  }, [products, selectedProducts, selectedBranch]);

  const restockChanges = useMemo<StockChange[]>(() => {
    const out: StockChange[] = [];
    for (const row of restockRows) {
      const raw = (restockValues[row.key] || '').trim();
      if (raw === '') continue;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) continue;
      const to = restockMode === 'add' ? row.change.from + n : n;
      if (to !== row.change.from) out.push({ ...row.change, to });
    }
    return out;
  }, [restockRows, restockValues, restockMode]);

  const statCardClass = (filter: StockFilter) =>
    `bg-white rounded-xl shadow-sm p-6 text-left w-full transition-shadow cursor-pointer hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 ${
      stockFilter === filter ? 'ring-2 ring-gray-900' : ''
    }`;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              Inventory Management
              {selectedBranch && (
                <span className="ml-3 inline-flex items-center gap-1 align-middle px-3 py-1 rounded-full bg-brand-primary/15 text-brand-text text-sm font-semibold">
                  <i className="ri-store-2-line" />
                  {selectedBranch.name}
                </span>
              )}
            </h1>
            <p className="text-gray-600 mt-1 md:mt-2 text-sm md:text-base">
              {selectedBranch
                ? `Stock at ${selectedBranch.name}. Click a number to edit it, or restock and import in bulk.`
                : 'Track stock levels, restock in bulk, and import counts from a spreadsheet.'}
            </p>
          </div>
          <Link href="/admin" className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap text-center">
            Back to Dashboard
          </Link>
        </div>

        {notice && (
          <div role="status" className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${notice.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
            <i className={`${notice.tone === 'ok' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'} text-lg`} />
            <span>{notice.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <button type="button" onClick={() => setStockFilter('all')} className={statCardClass('all')} aria-pressed={stockFilter === 'all'}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Products</p>
                <p className="text-3xl font-bold text-gray-900">{counts.all}</p>
              </div>
              <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-lg">
                <i className="ri-stack-line text-2xl text-gray-600" />
              </div>
            </div>
          </button>
          <button type="button" onClick={() => setStockFilter('low')} className={statCardClass('low')} aria-pressed={stockFilter === 'low'}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Low Stock Items</p>
                <p className="text-3xl font-bold text-amber-700">{counts.low}</p>
              </div>
              <div className="w-12 h-12 flex items-center justify-center bg-amber-100 rounded-lg">
                <i className="ri-alert-line text-2xl text-amber-700" />
              </div>
            </div>
          </button>
          <button type="button" onClick={() => setStockFilter('out')} className={statCardClass('out')} aria-pressed={stockFilter === 'out'}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Out of Stock</p>
                <p className="text-3xl font-bold text-red-600">{counts.out}</p>
              </div>
              <div className="w-12 h-12 flex items-center justify-center bg-red-100 rounded-lg">
                <i className="ri-close-circle-line text-2xl text-red-600" />
              </div>
            </div>
          </button>
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Retail Value</p>
                <p className="text-3xl font-bold text-gray-900">{formatPrice(totalValue, { decimals: true })}</p>
              </div>
              <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-lg">
                <i className="ri-money-dollar-circle-line text-2xl text-gray-700" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl" />
                <input
                  type="text"
                  placeholder="Search by product name or SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 text-sm"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-1">
                {FILTERS.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setStockFilter(filter.key)}
                    aria-pressed={stockFilter === filter.key}
                    className={`px-4 py-2 rounded-md font-medium text-sm transition-colors whitespace-nowrap cursor-pointer ${stockFilter === filter.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    {filter.label} ({counts[filter.key]})
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => { setImportPreview(null); setImportError(null); setShowImport(true); }} disabled={loading} className="bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white px-4 py-3 rounded-lg font-semibold flex items-center gap-2 cursor-pointer">
                <i className="ri-upload-line" /> Import CSV
              </button>
              <button type="button" onClick={handleExportCSV} disabled={loading || filteredProducts.length === 0} className="border-2 border-gray-300 hover:border-gray-400 disabled:opacity-60 text-gray-700 px-4 py-3 rounded-lg font-semibold flex items-center gap-2 cursor-pointer">
                <i className="ri-download-line" /> Export
              </button>
            </div>
          </div>

          {selectedProducts.length > 0 && (
            <div className="mt-4 flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-gray-800 font-medium">{selectedProducts.length} product{selectedProducts.length > 1 ? 's' : ''} selected</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setRestockMode('add'); setRestockValues({}); setRestockFill(''); setShowRestock(true); }}
                  className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg font-semibold cursor-pointer"
                >
                  Bulk Restock
                </button>
                <button type="button" onClick={() => setSelectedProducts([])} className="text-gray-600 hover:text-gray-900 font-medium cursor-pointer">
                  Clear Selection
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left">
                    <input type="checkbox" checked={allVisibleSelected} onChange={() => {
                      setSelectedProducts((prev) => allVisibleSelected
                        ? prev.filter((id) => !filteredProducts.some((p) => p.id === id))
                        : Array.from(new Set([...prev, ...filteredProducts.map((p) => p.id)])));
                    }} aria-label="Select every product shown" className="w-5 h-5 text-gray-900 rounded cursor-pointer" />
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Product</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">SKU</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Category</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Stock</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Retail Value</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr><td colSpan={8} className="p-10 text-center text-gray-500">Loading inventory...</td></tr>
                ) : filteredProducts.length === 0 ? (
                  <tr><td colSpan={8} className="p-10 text-center text-gray-500">{emptyText}</td></tr>
                ) : filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <input type="checkbox" checked={selectedProducts.includes(product.id)} onChange={() => setSelectedProducts((prev) => prev.includes(product.id) ? prev.filter((id) => id !== product.id) : [...prev, product.id])} aria-label={`Select ${product.name}`} className="w-5 h-5 text-gray-900 rounded cursor-pointer" />
                    </td>
                    <td className="px-6 py-4">
                      <Link href={`/admin/products/${product.id}`} className="font-semibold text-gray-900 hover:text-gray-700">{product.name}</Link>
                      <p className="text-sm text-gray-500">{product.variants.length > 0 ? `${product.variants.length} variant${product.variants.length > 1 ? 's' : ''}` : 'Single product'}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-700">{product.sku || 'N/A'}</td>
                    <td className="px-6 py-4 text-gray-700">{product.category}</td>
                    <td className="px-6 py-4">
                      {selectedBranch && editingId === product.id ? (
                        <div className="flex items-center gap-2">
                          <input type="number" min={0} value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveBranchStock(product.id); if (e.key === 'Escape') setEditingId(null); }} autoFocus className="w-20 px-2 py-1 border-2 border-gray-300 rounded-lg text-sm" />
                          <button type="button" onClick={() => saveBranchStock(product.id)} disabled={savingId === product.id} className="text-green-700 cursor-pointer"><i className={savingId === product.id ? 'ri-loader-4-line animate-spin' : 'ri-check-line text-lg'} /></button>
                          <button type="button" onClick={() => setEditingId(null)} className="text-gray-500 cursor-pointer"><i className="ri-close-line text-lg" /></button>
                        </div>
                      ) : selectedBranch ? (
                        <button type="button" onClick={() => { setEditingId(product.id); setEditValue(String(product.currentStock)); }} className="font-semibold text-gray-900 border-b border-dashed border-gray-400 cursor-pointer" title="Click to edit branch stock">{product.currentStock}</button>
                      ) : (
                        <div>
                          <span className="font-semibold text-gray-900">{product.currentStock}</span>
                          {!product.tracked && <span className="block text-xs text-gray-500">not tracked</span>}
                          {product.branchBreakdown.length > 0 && (
                            <p className="text-xs text-gray-500 mt-1 whitespace-nowrap">{product.branchBreakdown.map((b) => `${b.name.replace(/\s*branch\s*$/i, '')}: ${b.quantity}`).join(' · ')}</p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-900">{formatPrice(product.currentStock * product.price, { decimals: true })}</td>
                    <td className="px-6 py-4">
                      {!product.tracked ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600 whitespace-nowrap"><i className="ri-infinity-line mr-1" />Not tracked</span>
                      ) : product.status === 'low' ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800 whitespace-nowrap"><i className="ri-alert-fill mr-1" />Low Stock</span>
                      ) : product.status === 'out' ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700 whitespace-nowrap"><i className="ri-close-circle-fill mr-1" />Out of Stock</span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-900 whitespace-nowrap"><i className="ri-checkbox-circle-fill mr-1" />In Stock</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Link href={`/admin/products/${product.id}`} className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg" title="Edit product"><i className="ri-edit-line text-lg" /></Link>
                        {product.slug && (
                          <a href={`/product/${product.slug}`} target="_blank" rel="noreferrer" className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg" title="View on the store"><i className="ri-eye-line text-lg" /></a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Import stock from CSV</h2>
                <p className="mt-1 text-sm text-gray-600">Export first, change the Stock column, then upload. Blank stock cells are left alone.</p>
              </div>
              <button type="button" onClick={() => setShowImport(false)} className="ml-4 w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Close"><i className="ri-close-line text-xl" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-6 py-8 text-center hover:border-gray-500">
                <i className="ri-file-upload-line text-3xl text-gray-600" />
                <span className="text-sm font-semibold text-gray-900">{importPreview ? importPreview.fileName : 'Choose a CSV file'}</span>
                <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => readImportFile(e.target.files?.[0])} />
              </label>
              {importError && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{importError}</p>}
              {importPreview && (
                <div className="space-y-3 text-sm">
                  <p className="font-medium text-gray-800">{importPreview.changes.length} to update · {importPreview.unchanged} unchanged · {importPreview.problems.length} skipped</p>
                  {importPreview.problems.slice(0, 8).map((problem) => <p key={problem} className="text-red-700">{problem}</p>)}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button type="button" onClick={() => setShowImport(false)} className="px-4 py-2 text-sm font-medium text-gray-700">Cancel</button>
              <button type="button" onClick={confirmImport} disabled={saving || !importPreview || importPreview.changes.length === 0} className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? 'Updating…' : 'Update stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRestock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Bulk restock</h2>
                <p className="mt-1 text-sm text-gray-600">{restockRows.length} items. Add to the current count, or set an exact number.</p>
              </div>
              <button type="button" onClick={() => setShowRestock(false)} className="ml-4 w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Close"><i className="ri-close-line text-xl" /></button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
              <div className="flex rounded-lg bg-gray-100 p-1 text-sm font-medium">
                <button type="button" onClick={() => setRestockMode('add')} className={`rounded-md px-3 py-1.5 ${restockMode === 'add' ? 'bg-white shadow-sm' : 'text-gray-600'}`}>Add to stock</button>
                <button type="button" onClick={() => setRestockMode('set')} className={`rounded-md px-3 py-1.5 ${restockMode === 'set' ? 'bg-white shadow-sm' : 'text-gray-600'}`}>Set exact stock</button>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" min={0} value={restockFill} onChange={(e) => setRestockFill(e.target.value)} placeholder={restockMode === 'add' ? 'Add to all' : 'Set all to'} className="w-28 rounded-lg border-2 border-gray-300 px-3 py-1.5 text-sm" />
                <button type="button" onClick={() => {
                  const n = Number(restockFill.trim());
                  if (!Number.isInteger(n) || n < 0) return;
                  setRestockValues(Object.fromEntries(restockRows.map((r) => [r.key, String(n)])));
                }} className="rounded-lg border-2 border-gray-300 px-3 py-1.5 text-sm font-medium">Fill every row</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-2">
              <table className="w-full text-sm">
                <thead className="text-left text-xs font-semibold uppercase text-gray-500">
                  <tr><th className="py-2">Item</th><th className="py-2 text-right">Now</th><th className="py-2 text-right">{restockMode === 'add' ? 'Add' : 'Set to'}</th><th className="py-2 text-right">After</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {restockRows.map((row) => {
                    const raw = restockValues[row.key] ?? '';
                    const n = raw.trim() === '' ? null : Number(raw);
                    const valid = n !== null && Number.isInteger(n) && n >= 0;
                    const after = valid ? (restockMode === 'add' ? row.change.from + n : n) : row.change.from;
                    return (
                      <tr key={row.key}>
                        <td className="py-2 pr-3">{row.change.label}</td>
                        <td className="py-2 text-right text-gray-500">{row.change.from}</td>
                        <td className="py-2 text-right">
                          <input type="number" min={0} value={raw} onChange={(e) => setRestockValues((prev) => ({ ...prev, [row.key]: e.target.value }))} className="w-24 rounded-lg border-2 border-gray-300 px-2 py-1 text-right text-sm" />
                        </td>
                        <td className="py-2 text-right font-semibold">{after}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-6 py-4">
              <p className="text-sm text-gray-600">{restockChanges.length === 0 ? 'Type a number for the rows you want to change.' : `${restockChanges.length} will change.`}</p>
              <button type="button" onClick={async () => {
                const ok = await applyStockChanges(restockChanges);
                if (ok) { setShowRestock(false); setSelectedProducts([]); }
              }} disabled={saving || restockChanges.length === 0} className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? 'Updating…' : 'Update stock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
