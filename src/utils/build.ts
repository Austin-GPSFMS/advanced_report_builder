/**
 * Build orchestration — the entry point used by App.tsx when the user clicks
 * "Build Report". Coordinates source fetches in parallel, then joins them
 * device-by-device into rows.
 */

import type {
  BuildContext,
  GeotabApi,
  GeotabDevice,
  ReportColumn,
  ReportResult,
  ReportRow,
  SourceName,
} from "../types";
import { lookupField, getRequiredFields } from "../registry/fields";
import { SOURCES } from "../registry/sources";
import { expandColumns, aggregateRows } from "./columns";
import { computeParentGroup } from "./groups";

export interface BuildArgs {
  api: GeotabApi;
  ctx: BuildContext;
  /** Optional fields the user explicitly picked (in addition to required ones). */
  selectedFieldIds: string[];
}

export async function buildReport({
  api,
  ctx,
  selectedFieldIds,
}: BuildArgs): Promise<ReportResult> {
  const requiredIds = getRequiredFields().map((f) => f.id);
  const fieldIds = [...requiredIds, ...selectedFieldIds.filter((id) => !requiredIds.includes(id))];
  ctx.activeFieldIds = fieldIds;

  // Pre-flight: error early when a date-range field is in play without dates.
  const needsRange = fieldIds.some((id) => lookupField(id)?.needsDateRange);
  if (needsRange && (!ctx.fromDate || !ctx.toDate)) {
    throw new Error(
      "Pick a From and To date — at least one selected field needs a time range."
    );
  }

  const sourcesNeeded = new Set<SourceName>();
  for (const id of fieldIds) {
    const f = lookupField(id);
    if (f) sourcesNeeded.add(f.source);
  }

  // Fetch all needed sources in parallel.
  const sourceEntries = await Promise.all(
    Array.from(sourcesNeeded).map(async (source) => {
      const def = SOURCES[source];
      if (!def) throw new Error(`Unknown source: ${source}`);
      return [source, await def.fetch(api, ctx)] as const;
    })
  );
  const sources: Record<string, Map<string, unknown>> = {};
  for (const [name, map] of sourceEntries) sources[name] = map;
  ctx.sources = sources;

  return joinAndRender(ctx, fieldIds);
}

function joinAndRender(ctx: BuildContext, fieldIds: string[]): ReportResult {
  const deviceMap =
    (ctx.sources?.Device as Map<string, GeotabDevice> | undefined) ?? new Map();
  const columns = expandColumns(fieldIds, ctx.buckets);
  const individualRows: ReportRow[] = [];

  deviceMap.forEach((device) => {
    const row: ReportRow = { _deviceId: device.id };
    row._parentGroup = computeParentGroup(device, ctx.groupsById);
    for (const col of columns) {
      const f = lookupField(col.fieldId);
      if (!f) continue;
      try {
        if (col.bucketIdx == null) {
          row[col.key] = f.get ? f.get(device, ctx) : "";
        } else {
          const sourceMap = ctx.sources?.[f.source]?.get(device.id);
          const rec = sourceMap as Record<string, unknown> | undefined;
          const arr = rec?.[`${col.fieldId}__buckets`] as
            | Array<number | null>
            | undefined;
          const v = arr ? arr[col.bucketIdx] : null;
          if (v == null || (typeof v === "number" && isNaN(v))) {
            row[col.key] = "";
          } else if (f.formatBucket && typeof v === "number") {
            row[col.key] = f.formatBucket(v);
          } else if (typeof v === "number") {
            row[col.key] = v.toFixed(1);
          } else {
            row[col.key] = String(v);
          }
        }
      } catch {
        row[col.key] = "";
      }
    }
    individualRows.push(row);
  });

  // Stable sort: by Vehicle Name if present, else by Device ID.
  const sortKey = columns.find((c) => c.fieldId === "name")?.key ?? "_deviceId";
  individualRows.sort((a, b) =>
    String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""))
  );

  const displayRows =
    ctx.runBy === "group" ? aggregateRows(individualRows, columns, "group") : individualRows;

  return {
    columns,
    rows: displayRows,
    individualRows,
    runBy: ctx.runBy,
    buckets: ctx.buckets,
  };
}

/** Convenience: returns a list of all selectable field IDs (excluding required ones). */
export function getSelectableFieldIds(): string[] {
  return getRequiredFields()
    .map((f) => f.id)
    .concat(...[]); // placeholder for symmetry; required IDs handled separately
}

export interface ColumnKeyResolver {
  (col: ReportColumn): string;
}

export const colKey: ColumnKeyResolver = (col) => col.key;
