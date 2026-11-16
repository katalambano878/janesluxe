export function formatPrice(amount: number, options?: { decimals?: boolean }): string {
  const value = Number(amount) || 0;
  const formatted = value.toLocaleString('en-GH', {
    minimumFractionDigits: options?.decimals ? 2 : 0,
    maximumFractionDigits: options?.decimals ? 2 : 0,
  });
  return `GH₵${formatted}`;
}