export function formatPrice(price?: string | null, currency = "€"): string {
  if (!price) return "—";
  const trimmed = price.trim();
  if (trimmed.startsWith(currency) || trimmed.startsWith("$") || trimmed.startsWith("£")) {
    return trimmed;
  }
  return `${currency}${trimmed}`;
}

export function formatDuration(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function formatDurationShort(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return "—";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
