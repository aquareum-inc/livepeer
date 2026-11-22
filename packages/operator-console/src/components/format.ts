export const usd = (value: number | string | null | undefined, digits = 2): string => {
  const amount = Number(value ?? 0);
  if (amount !== 0 && Math.abs(amount) < 0.01) return `$${amount.toPrecision(2)}`;
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
};

export const count = (value: number): string => new Intl.NumberFormat("en").format(value);

export const dateTime = (value: string | null | undefined): string =>
  value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";

export function ago(value: string | null | undefined, now = Date.now()): string {
  if (!value) return "never";
  const seconds = Math.max(0, Math.round((now - Date.parse(value)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

/** A day without its time, "Dec 21": for something that ends on a date. */
export const day = (value: string | null | undefined): string => (value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value)) : "—");

export const host = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export const label = (app: string): string => {
  const words = (app.split("/").pop() ?? app).replace(/[_-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};
