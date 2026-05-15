/**
 * Phase 2B.4 — Zenith Table for results.
 *
 * Wraps a ReportResult into Zenith's <Table> component so we get the
 * native MyGeotab list experience: sortable headers, sticky header,
 * resizable columns, column-visibility menu, hover styles, etc.
 *
 * Zenith fires onChange on a header click but does NOT sort the entities
 * for us — so we keep sortValue in local state and useMemo a sorted
 * copy of the row list before passing it in. useFlexibleColumns handles
 * its own UI but persists settings under pageName so column widths and
 * visibility carry between sessions.
 *
 * Each row must have a stable string id. We derive it from _deviceId
 * (which is the group ID under Per Group aggregation, the device ID
 * otherwise) — guaranteed unique across the row set.
 */

import { useMemo, useState } from "react";
import {
  Table,
  ColumnSortDirection,
  type IListColumn,
} from "@geotab/zenith";
import type { ReportColumn, ReportResult, ReportRow } from "../types";

/**
 * Local copy of @geotab/zenith's ISortableValue — used internally by
 * Table's sortable option but not re-exported from the package index.
 */
interface ISortableValue {
  sortColumn: string;
  sortDirection: ColumnSortDirection;
}

export interface ResultsTableProps {
  result: ReportResult;
  /** Page name used as the storage key for column widths + sort state. */
  pageName?: string;
}

/** Row shape Zenith Table is happy with — adds the required string id. */
interface TableEntity extends ReportRow {
  id: string;
}

/* Cell rendering */

function formatCell(v: unknown): string {
  if (v == null || v === "") return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

/* Sort comparator */

function sortEntities(rows: TableEntity[], sort: ISortableValue | undefined): TableEntity[] {
  if (!sort) return rows;
  const { sortColumn, sortDirection } = sort;
  const dir = sortDirection === ColumnSortDirection.Descending ? -1 : 1;

  let numeric = false;
  for (const r of rows) {
    const v = r[sortColumn];
    if (v == null || v === "") continue;
    numeric = typeof v === "number" || (!Number.isNaN(Number(v)) && typeof v !== "boolean");
    break;
  }

  const cmp = (a: TableEntity, b: TableEntity): number => {
    const av = a[sortColumn];
    const bv = b[sortColumn];
    const aEmpty = av == null || av === "";
    const bEmpty = bv == null || bv === "";
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    if (numeric) {
      const an = typeof av === "number" ? av : Number(av);
      const bn = typeof bv === "number" ? bv : Number(bv);
      if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * dir;
    }
    return String(av).localeCompare(String(bv)) * dir;
  };

  return [...rows].sort(cmp);
}

/* Column builder */

function buildColumns(reportColumns: ReportColumn[]): IListColumn<TableEntity>[] {
  return reportColumns.map((c) => ({
    id: c.key,
    title: c.label,
    sortable: true,
    meta: {
      defaultWidth: c.label.length > 16 ? 180 : 140,
    },
    columnComponent: {
      render: (entity: TableEntity) => formatCell(entity[c.key]),
    },
  }));
}

/* Component */

export function ResultsTable({ result, pageName = "arb-results" }: ResultsTableProps) {
  const entities = useMemo<TableEntity[]>(
    () => result.rows.map((r) => ({ ...r, id: String(r._deviceId) })),
    [result.rows]
  );

  const columns = useMemo(() => buildColumns(result.columns), [result.columns]);

  const [sortValue, setSortValue] = useState<ISortableValue | undefined>(undefined);

  const sortedEntities = useMemo(
    () => sortEntities(entities, sortValue),
    [entities, sortValue]
  );

  return (
    <Table
      entities={sortedEntities}
      columns={columns}
      sortable={{
        pageName: pageName + "-sort",
        value: sortValue,
        onChange: setSortValue,
      }}
      flexible={{
        pageName: pageName + "-columns",
        columnsPopup: true,
      }}
      height="50vh"
    >
      <Table.Empty>No rows match the current filters.</Table.Empty>
    </Table>
  );
}
