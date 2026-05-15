/**
 * Phase 2C.2 — ExcelJS xlsx export.
 *
 * Produces a multi-sheet workbook from a ReportResult plus the BuildContext
 * the user was working with, and downloads it via a temporary blob URL.
 *
 *   1. "Report Metadata" — what filters produced this report (group(s),
 *      date range, sub-period, run-by, archived setting, columns chosen,
 *      and the generated-at timestamp). Always present.
 *   2. "Results" — the rendered rows + columns, exactly as displayed in
 *      the Zenith Table. Header is bold + frozen, autoFilter on.
 *   3. "Individual Data" — only emitted when runBy === "group", so the
 *      un-aggregated per-device rows are preserved in the export.
 *
 * The implementation is intentionally framework-free: it takes the
 * ReportResult + ctx and returns a Promise<void> that resolves after the
 * download fires. App.tsx just wires it to an Export button.
 *
 * ExcelJS is a CommonJS module — we import the default and use Workbook
 * directly. The browser bundle is large but already pinned in package.json,
 * so we don't need a CDN loader like the vanilla build did.
 */

import ExcelJS from "exceljs";
import type { BuildContext, ReportColumn, ReportResult, ReportRow } from "../types";
import { lookupField } from "../registry/fields";

/** Header cell styling — navy fill, white bold text, matches GPSFMS brand. */
const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF25477B" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  color: { argb: "FFFFFFFF" },
  bold: true,
};

/** Coerce a cell value into something ExcelJS will round-trip cleanly. */
function cellValue(v: unknown): string | number | null {
  if (v == null || v === "") return null;
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  if (typeof v === "number") return v;
  // Strings that look numeric should still come through as numbers so Excel
  // can sort + sum on them. Skip if string starts with leading zeros
  // (probably an ID or VIN).
  const s = String(v);
  if (s.length > 0 && /^-?\d+(\.\d+)?$/.test(s) && !/^0\d/.test(s)) {
    const n = Number(s);
    if (!Number.isNaN(n)) return n;
  }
  return s;
}

/** Auto-size columns based on the longest cell content (cap at 60). */
function autosizeColumns(sheet: ExcelJS.Worksheet, columns: ReportColumn[]) {
  sheet.columns.forEach((col, idx) => {
    const headerLen = (columns[idx]?.label ?? "").length;
    let max = Math.max(headerLen, 8);
    col.eachCell?.({ includeEmpty: false }, (cell, rowIdx) => {
      if (rowIdx === 1) return; // header already counted
      const s = cell.value == null ? "" : String(cell.value);
      if (s.length > max) max = s.length;
    });
    col.width = Math.min(max + 2, 60);
  });
}

/** Build the human-readable "Report Metadata" sheet. */
function writeMetadataSheet(
  wb: ExcelJS.Workbook,
  ctx: BuildContext,
  selectedFieldIds: string[],
  result: ReportResult,
  groupNamesById: Map<string, string>
) {
  const sheet = wb.addWorksheet("Report Metadata");
  sheet.columns = [
    { header: "Field", key: "key", width: 22 },
    { header: "Value", key: "value", width: 80 },
  ];

  const groupLabels = ctx.groupIds
    .map((id) => groupNamesById.get(id) ?? id)
    .join(", ");
  const cols = selectedFieldIds
    .map((id) => lookupField(id)?.label ?? id)
    .join(", ");
  const fromIso = ctx.fromDate ? ctx.fromDate.toISOString().slice(0, 10) : "(none)";
  const toIso = ctx.toDate ? ctx.toDate.toISOString().slice(0, 10) : "(none)";

  const rows: Array<[string, string | number]> = [
    ["Generated at", new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC"],
    ["Group(s)", groupLabels],
    ["Date range", `${fromIso} → ${toIso}`],
    ["Sub-period", ctx.subPeriod],
    ["Run by", ctx.runBy === "group" ? "Per group" : "Individual"],
    ["Archived devices", ctx.includeArchived ? "Included" : "Excluded"],
    ["Selected columns", cols],
    ["Row count (displayed)", result.rows.length],
    ["Row count (individual)", result.individualRows.length],
  ];
  for (const [k, v] of rows) sheet.addRow({ key: k, value: v });

  // Style header row + first column label.
  const header = sheet.getRow(1);
  header.font = HEADER_FONT;
  header.fill = HEADER_FILL;
  sheet.getColumn("key").font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

/** Write a "data" sheet (Results or Individual Data) using the report columns. */
function writeDataSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: ReportColumn[],
  rows: ReportRow[]
) {
  const sheet = wb.addWorksheet(name);
  sheet.columns = columns.map((c) => ({ header: c.label, key: c.key }));

  for (const row of rows) {
    const obj: Record<string, string | number | null> = {};
    for (const c of columns) obj[c.key] = cellValue(row[c.key]);
    sheet.addRow(obj);
  }

  // Header styling + freeze + autoFilter.
  const header = sheet.getRow(1);
  header.font = HEADER_FONT;
  header.fill = HEADER_FILL;
  header.height = 22;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: columns.length },
    };
  }
  autosizeColumns(sheet, columns);
}

export interface ExportArgs {
  result: ReportResult;
  ctx: BuildContext;
  selectedFieldIds: string[];
  groupNamesById: Map<string, string>;
}

/** Generate the xlsx blob and trigger a browser download. */
export async function exportToXlsx({
  result,
  ctx,
  selectedFieldIds,
  groupNamesById,
}: ExportArgs): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "GPSFMS Advanced Report Builder";
  wb.created = new Date();

  // Order matters: the first sheet is the one Excel opens to. Put the
  // user's data first, then the metadata / individual breakdown.
  writeDataSheet(wb, "Results", result.columns, result.rows);
  if (ctx.runBy === "group") {
    writeDataSheet(wb, "Individual Data", result.columns, result.individualRows);
  }
  writeMetadataSheet(wb, ctx, selectedFieldIds, result, groupNamesById);
  // Belt-and-suspenders: also pin the active tab to "Results" via workbook views.
  wb.views = [{ activeTab: 0, firstSheet: 0, visibility: "visible", x: 0, y: 0, width: 12000, height: 8000 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);

  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const a = document.createElement("a");
  a.href = url;
  a.download = `advanced_report_${stamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so Chrome flushes the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
