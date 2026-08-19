/**
 * Human-readable labels for orders.shipping_method values used at checkout / POS.
 */

export type ShippingKind = 'pickup' | 'delivery' | 'unknown';

export function getShippingMethodInfo(method?: string | null): {
  kind: ShippingKind;
  label: string;
  short: string;
  icon: string;
  hint: string;
} {
  const raw = String(method || '').trim().toLowerCase();

  if (raw === 'pickup' || raw === 'store_pickup' || raw === 'store-pickup') {
    return {
      kind: 'pickup',
      label: 'Store Pickup',
      short: 'Pickup',
      icon: 'ri-store-2-line',
      hint: 'Customer will collect from the store',
    };
  }

  if (raw === 'doorstep' || raw === 'delivery' || raw === 'home_delivery') {
    return {
      kind: 'delivery',
      label: 'Doorstep Delivery',
      short: 'Delivery',
      icon: 'ri-truck-line',
      hint: 'Deliver to customer address — confirm fee with customer',
    };
  }

  if (raw === 'accra') {
    return {
      kind: 'delivery',
      label: 'Accra Delivery',
      short: 'Accra',
      icon: 'ri-truck-line',
      hint: 'Delivery within Accra',
    };
  }

  if (raw === 'outside-accra' || raw === 'outside_accra') {
    return {
      kind: 'delivery',
      label: 'Outside Accra Delivery',
      short: 'Outside Accra',
      icon: 'ri-bus-line',
      hint: 'Delivery to bus station / outside Accra',
    };
  }

  if (raw === 'standard') {
    return {
      kind: 'delivery',
      label: 'Standard Shipping',
      short: 'Standard',
      icon: 'ri-truck-line',
      hint: 'Standard delivery',
    };
  }

  if (raw === 'express') {
    return {
      kind: 'delivery',
      label: 'Express Shipping',
      short: 'Express',
      icon: 'ri-flashlight-line',
      hint: 'Express delivery',
    };
  }

  if (!raw) {
    return {
      kind: 'unknown',
      label: 'Not specified',
      short: 'N/A',
      icon: 'ri-question-line',
      hint: 'No fulfillment method was saved on this order',
    };
  }

  return {
    kind: 'delivery',
    label: raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    short: raw,
    icon: 'ri-truck-line',
    hint: 'Custom shipping method',
  };
}

export function shippingMethodBadgeClass(kind: ShippingKind): string {
  if (kind === 'pickup') return 'bg-amber-100 text-amber-900 border-amber-200';
  if (kind === 'delivery') return 'bg-blue-100 text-blue-800 border-blue-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}
