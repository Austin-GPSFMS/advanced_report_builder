/**
 * Date utilities — formatting, parsing, presets, and sub-period bucketing.
 *
 * All bucket boundaries are inclusive on both ends and computed in local time.
 */

import type { Bucket } from "../types";

export type DatePreset =
  | "custom"
  | "today"
  | "yesterday"
  | "thisweek"
  | "lastweek"
  | "thismonth"
  | "lastmonth"
  | "7d"
  | "30d"
  | "90d";

export type SubPeriod = "none" | "daily" | "weekly" | "monthly";

export function isoDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(v: string | Date | null | undefined): string {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const y = d.getFullYear();
  if (y <= 1990) return "(beginning of time)";
  if (y >= 2050) return "(no end)";
  return isoDateOnly(d);
}

export function formatDateTime(v: string | Date | null | undefined): string {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/** Compute From/To for a named preset relative to today, in local time. */
export function applyDatePreset(preset: DatePreset): { from: Date; to: Date } | null {
  if (preset === "custom") return null;
  const now = new Date();
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const endOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };
  const startOfWeek = (d: Date) => {
    const x = new Date(d);
    const day = x.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday as start
    x.setDate(x.getDate() + diff);
    return startOfDay(x);
  };

  switch (preset) {
    case "today":
      return { from: startOfDay(new Date()), to: endOfDay(new Date()) };
    case "yesterday": {
      const y = new Date(now.getTime() - 86400000);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "thisweek":
      return { from: startOfWeek(new Date()), to: endOfDay(new Date()) };
    case "lastweek": {
      const lw = new Date(now.getTime() - 7 * 86400000);
      const from = startOfWeek(lw);
      const to = endOfDay(new Date(from.getTime() + 6 * 86400000));
      return { from, to };
    }
    case "thismonth":
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: endOfDay(new Date()),
      };
    case "lastmonth":
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case "7d":
      return {
        from: startOfDay(new Date(now.getTime() - 7 * 86400000)),
        to: endOfDay(new Date()),
      };
    case "30d":
      return {
        from: startOfDay(new Date(now.getTime() - 30 * 86400000)),
        to: endOfDay(new Date()),
      };
    case "90d":
      return {
        from: startOfDay(new Date(now.getTime() - 90 * 86400000)),
        to: endOfDay(new Date()),
      };
    default:
      return null;
  }
}

/** Build sub-period buckets for the given date range. Returns null when subPeriod is "none". */
export function computeBuckets(
  fromDate: Date | null,
  toDate: Date | null,
  subPeriod: SubPeriod
): Bucket[] | null {
  if (subPeriod === "none" || !fromDate || !toDate) return null;
  const buckets: Bucket[] = [];
  const cursor = new Date(fromDate);
  cursor.setHours(0, 0, 0, 0);
  const hardStop = new Date(toDate);
  hardStop.setHours(23, 59, 59, 999);
  let safety = 0;
  while (cursor <= hardStop && safety++ < 400) {
    const start = new Date(cursor);
    let end: Date;
    if (subPeriod === "daily") {
      end = new Date(cursor);
      end.setHours(23, 59, 59, 999);
      cursor.setDate(cursor.getDate() + 1);
    } else if (subPeriod === "weekly") {
      end = new Date(cursor);
      const daysToSunday = (7 - end.getDay()) % 7;
      end.setDate(end.getDate() + daysToSunday);
      end.setHours(23, 59, 59, 999);
      cursor.setTime(end.getTime());
      cursor.setSeconds(cursor.getSeconds() + 1);
    } else {
      // monthly
      end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
      cursor.setTime(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).getTime());
    }
    if (end > hardStop) end = hardStop;
    buckets.push({ start, end, label: formatBucketLabel(start, subPeriod) });
  }
  return buckets;
}

function formatBucketLabel(d: Date, subPeriod: SubPeriod): string {
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  const iso = isoDateOnly(d);
  if (subPeriod === "daily") return `${dow} ${iso.slice(5)}`;
  if (subPeriod === "weekly") return `Wk of ${iso.slice(5)}`;
  if (subPeriod === "monthly") return d.toLocaleString("en-US", { month: "short", year: "2-digit" });
  return iso;
}
