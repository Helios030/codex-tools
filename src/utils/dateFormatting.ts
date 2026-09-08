export function formatFullDate(
  epochSec: number | null | undefined,
  locale: string,
  emptyValue: string,
): string {
  if (!epochSec) {
    return emptyValue;
  }

  return new Date(epochSec * 1000).toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
