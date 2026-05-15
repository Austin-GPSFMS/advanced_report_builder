/**
 * Column expansion + per-group aggregation.
 *
 * `expandColumns` turns a flat list of fieldIds into the actual columns shown
 * in the results table — when sub-period buckets are active, each date-range
 * field expands into one column per bucket.
 *
 * `aggregateRows` rolls per-device rows up to one row per parent group when
 * Run by = "group". Numeric fields are summed; identity fields are replaced
 * with the group's label so the row is self-identifying.
 */

import type {
  Bucket,
  FieldDefinition,
  ReportColumn,
  ReportRow,
} from "../types";
import { lookupField } from "../registry/fields";

export function expandColumns(
  fieldIds: string[],
  buckets: Bucket[] | null
): ReportColumn[] {
  const out: ReportColumn[] = [];
  for (const fid of fieldIds) {
    const f = lookupField(fid);
    if (!f) continue;
    if (f.needsDateRange && buckets && buckets.length) {
      buckets.forEach((b, bi) => {
        out.push({
          fieldId: fid,
          bucketIdx: bi,
          label: `${f.label} · ${b.label}`,
          key: `${fid}__${bi}`,
        });
      });
    } else {
      out.push({ fieldId: fid, bucketIdx: null, label: f.label, key: fid });
    }
  }
  return out;
}

function isNumericField(f: FieldDefinition): boolean {
  return f.source === "StatusData" || f.source === "ExceptionEvent";
}

/**
 * Run-by = "group" → one row per distinct _parentGroup. Numeric fields are
 * summed; identity-like text fields become the group's label so the row is
 * self-identifying; per-vehicle text fields go blank because they don't
 * apply at group level.
 */
export function aggregateRows(
  rows: ReportRow[],
  cols: ReportColumn[],
  mode: "individual" | "group"
): ReportRow[] {
  if (!rows.length || mode !== "group") return rows;
  const byGroup = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const g = (r._parentGroup as string) || "(no group)";
    const list = byGroup.get(g);
    if (list) list.push(r);
    else byGroup.set(g, [r]);
  }
  const labels = Array.from(byGroup.keys()).sort();
  return labels.map((label) => aggregateBucket(byGroup.get(label) ?? [], cols, label));
}

function aggregateBucket(
  bucketRows: ReportRow[],
  cols: ReportColumn[],
  label: string
): ReportRow {
  const aggRow: ReportRow = {
    _deviceId: `aggregate__${label}`,
    _aggregate: true,
    _groupLabel: label,
    _count: bucketRows.length,
  };

  for (const col of cols) {
    const f = lookupField(col.fieldId);
    if (!f) continue;
    const numeric = isNumericField(f) || col.bucketIdx != null;
    if (numeric) {
      let sum = 0;
      let any = false;
      for (const r of bucketRows) {
        const raw = r[col.key];
        const v = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
        if (!isNaN(v)) {
          sum += v;
          any = true;
        }
      }
      if (!any) {
        aggRow[col.key] = "";
        continue;
      }
      aggRow[col.key] = f.formatBucket ? f.formatBucket(sum) : sum.toFixed(1);
    } else if (
      col.fieldId === "deviceId" ||
      col.fieldId === "name" ||
      col.fieldId === "parentGroup" ||
      col.fieldId === "groups"
    ) {
      aggRow[col.key] = label;
    } else if (col.fieldId === "serial") {
      const n = bucketRows.length;
      aggRow[col.key] = `(${n} vehicle${n === 1 ? "" : "s"})`;
    } else {
      aggRow[col.key] = "";
    }
  }

  return aggRow;
}
