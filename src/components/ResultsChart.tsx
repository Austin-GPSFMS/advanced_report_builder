/**
 * Phase 2C.1 — Zenith LineChart for per-bucket metrics.
 *
 * Only meaningful when sub-periods are active (buckets !== null). For every
 * field that expanded into per-bucket columns (Distance, Engine Hours, any
 * Rule's exception count), we sum the per-bucket value across all rows and
 * plot a line — bucket label on the X axis, summed metric on the Y axis.
 *
 * A simple chip-style toggle lets the user pick which metrics to plot;
 * defaults to "all on" so something is visible immediately after Build Report.
 *
 * Built on @geotab/zenith's LineChart, which itself wraps Chart.js — we just
 * shape the data into ILineChartData with one dataset per metric.
 */

import { useMemo, useState } from "react";
import { LineChart } from "@geotab/zenith";
// LineChart's data prop resolves through Chart.js's strict ChartData<"line">,
// which expects x:number on points. Zenith's ILineChartPoint widens that to
// string|Date but the public typing still narrows. Cast through unknown so we
// can use bucket-label strings on the x-axis without fighting the types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LineChartData = any;
import type { Bucket, ReportColumn, ReportResult, ReportRow } from "../types";
import { lookupField } from "../registry/fields";

export interface ResultsChartProps {
  result: ReportResult;
}

/* GPSFMS palette — first N metrics get distinct colors, then we cycle. */
const SERIES_COLORS = [
  "#25477B", // navy
  "#0084C2", // blue
  "#2E7D32", // green
  "#E65100", // amber
  "#7B1FA2", // purple
  "#C62828", // red
  "#00838F", // teal
  "#5D4037", // brown
];

interface SeriesSpec {
  fieldId: string;
  label: string;
  /** ordered by bucketIdx; one ReportColumn per bucket. */
  bucketColumns: ReportColumn[];
}

/**
 * Find every per-bucket field in result.columns and pair it with its
 * ordered bucket columns. Non-bucket fields are skipped — they're not
 * a time series.
 */
function collectSeries(columns: ReportColumn[]): SeriesSpec[] {
  const byField = new Map<string, ReportColumn[]>();
  for (const c of columns) {
    if (c.bucketIdx == null) continue;
    const arr = byField.get(c.fieldId);
    if (arr) arr.push(c);
    else byField.set(c.fieldId, [c]);
  }
  const out: SeriesSpec[] = [];
  byField.forEach((cols, fieldId) => {
    const sorted = cols.slice().sort((a, b) => (a.bucketIdx ?? 0) - (b.bucketIdx ?? 0));
    out.push({
      fieldId,
      label: lookupField(fieldId)?.label ?? fieldId,
      bucketColumns: sorted,
    });
  });
  // Stable order: alphabetical by label.
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

/** Sum a column across rows, treating "" / NaN as 0 and stringy numbers as numbers. */
function sumColumn(rows: ReportRow[], key: string): number {
  let s = 0;
  for (const r of rows) {
    const v = r[key];
    const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
    if (!Number.isNaN(n)) s += n;
  }
  return s;
}

/** Build the Chart.js data shape Zenith's LineChart expects. */
function buildChartData(
  seriesList: SeriesSpec[],
  enabledFieldIds: Set<string>,
  buckets: Bucket[],
  rows: ReportRow[]
): LineChartData {
  const datasets = seriesList
    .filter((s) => enabledFieldIds.has(s.fieldId))
    .map((s, visibleIdx) => {
      const color = SERIES_COLORS[visibleIdx % SERIES_COLORS.length];
      const data = s.bucketColumns.map((col, bi) => ({
        x: buckets[bi]?.label ?? `Bucket ${bi + 1}`,
        y: sumColumn(rows, col.key),
      }));
      return {
        label: s.label,
        data,
        borderColor: color,
        backgroundColor: color,
        pointBackgroundColor: color,
        pointBorderColor: color,
        tension: 0.25,
      };
    });
  return { datasets };
}

export function ResultsChart({ result }: ResultsChartProps) {
  const buckets = result.buckets;
  const seriesList = useMemo(() => collectSeries(result.columns), [result.columns]);
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(seriesList.map((s) => s.fieldId))
  );

  // Re-sync enabled set when columns/series change (new Build Report).
  // Without this, removing a column would leave a dead id in the enabled set.
  useMemo(() => {
    const allIds = new Set(seriesList.map((s) => s.fieldId));
    let drift = false;
    enabled.forEach((id) => {
      if (!allIds.has(id)) drift = true;
    });
    if (drift) setEnabled(allIds);
  }, [seriesList]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = useMemo(
    () => buildChartData(seriesList, enabled, buckets ?? [], result.individualRows),
    [seriesList, enabled, buckets, result.individualRows]
  );

  if (!buckets || buckets.length === 0 || seriesList.length === 0) {
    return null;
  }

  function toggle(fieldId: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });
  }

  return (
    <div>
      {/* Chip toggle row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {seriesList.map((s, idx) => {
          const isOn = enabled.has(s.fieldId);
          const color = SERIES_COLORS[idx % SERIES_COLORS.length];
          return (
            <button
              key={s.fieldId}
              type="button"
              onClick={() => toggle(s.fieldId)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                fontSize: 12,
                borderRadius: 14,
                border: `1px solid ${isOn ? color : "#D8DEE5"}`,
                background: isOn ? color : "#FFFFFF",
                color: isOn ? "#FFFFFF" : "#1C2B39",
                cursor: "pointer",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: color,
                  border: isOn ? "1px solid #FFFFFF" : `1px solid ${color}`,
                  display: "inline-block",
                }}
              />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Chart canvas */}
      <div style={{ height: 320 }}>
        <LineChart
          data={data}
          options={{
            maintainAspectRatio: false,
            responsive: true,
            interaction: { mode: "nearest", intersect: false },
            scales: {
              x: { ticks: { autoSkip: true, maxRotation: 0 } },
              y: { beginAtZero: true },
            },
          }}
        />
      </div>
    </div>
  );
}
