/**
 * Phase 2B.5 App — native toolbar + dynamic Rule loading.
 *
 * No Filters card, no labels above each control. Group / Date range /
 * Sub-period / Run by / Archived sit in one compact horizontal row
 * directly under the page header, exactly like MyGeotab's Assets,
 * Users & Drivers, and Maintenance Overview pages.
 *
 * Each dropdown's items embed their meaning (e.g. "Sub-period: Daily")
 * so the dropdown's trigger button is self-describing without needing
 * a separate label above it.
 *
 *   Banner    → @geotab/zenith
 *   Button    → @geotab/zenith
 *   Card      → @geotab/zenith (Columns + Results only)
 *   DateRange → @geotab/zenith (withCalendar)
 *   Dropdown  → @geotab/zenith
 *   GroupsFilter → @geotab/zenith (via ./components/GroupFilterPicker)
 *   Columns   → dnd-kit drag-and-drop palette + drop zone (2B.3)
 *   Results   → Zenith Table (sortable + flexible columns, 2B.4)
 */

import { useEffect, useState } from "react";
import {
  Banner,
  Button,
  Card,
  Content,
  DateRange,
  Dropdown,
  GET_LAST_SEVEN_DAYS_OPTION,
  GET_LAST_THIRTY_DAYS_OPTION,
  GET_LAST_MONTH_OPTION,
  GET_LAST_WEEK_OPTION,
  GET_THIS_MONTH_OPTION,
  GET_THIS_WEEK_OPTION,
  GET_TODAY_OPTION,
  GET_YESTERDAY_OPTION,
  type IDateRangeValue,
  type ISelectionItem,
} from "@geotab/zenith";
import type {
  BuildContext,
  GeotabApi,
  GeotabGroup,
  GeotabPageState,
  ReportResult,
} from "./types";
import { fetchGroups, fetchRules, friendlyError, type GeotabRule } from "./api/geotab";
import type { FieldDefinition } from "./types";
import { getAllFields, getOptionalFields, getRequiredFields, setDynamicFields } from "./registry/fields";
import { computeBuckets, type SubPeriod } from "./utils/dates";
import { buildReport } from "./utils/build";
import { GroupFilterPicker } from "./components/GroupFilterPicker";
import { DragDropFieldPicker } from "./components/DragDropFieldPicker";
import { ResultsTable } from "./components/ResultsTable";

interface AppProps {
  api: GeotabApi | null;
  pageState: GeotabPageState | null;
}

const COLORS = {
  navy: "#25477B",
};

// Dropdown items — each name includes the meaning so the trigger button
// reads as a complete sentence (e.g. "Sub-period: Daily").
const subPeriodItems = [
  { id: "none", name: "Sub-period: None" },
  { id: "daily", name: "Sub-period: Daily" },
  { id: "weekly", name: "Sub-period: Weekly" },
  { id: "monthly", name: "Sub-period: Monthly" },
];
const runByItems = [
  { id: "individual", name: "Run by: Individual" },
  { id: "group", name: "Run by: Per group" },
];
const archivedItems = [
  { id: "exclude", name: "Archived: Excluded" },
  { id: "include", name: "Archived: Included" },
];

// Date range presets shown inside the DateRange popup.
const dateRangeOptions = [
  GET_TODAY_OPTION(),
  GET_YESTERDAY_OPTION(),
  GET_THIS_WEEK_OPTION(),
  GET_LAST_WEEK_OPTION(),
  GET_THIS_MONTH_OPTION(),
  GET_LAST_MONTH_OPTION(),
  GET_LAST_SEVEN_DAYS_OPTION(),
  GET_LAST_THIRTY_DAYS_OPTION(),
];

/**
 * Build a FieldDefinition from a Geotab Rule. Each rule becomes a draggable
 * card under "Exception Rules" with an exception-count cell value. The field
 * id is prefixed (`rule:<id>`) so it can never collide with a static field.
 */
function ruleToField(rule: GeotabRule): FieldDefinition {
  const fieldId = `rule:${rule.id}`;
  const label = rule.name && rule.name.length > 0 ? rule.name : rule.id;
  return {
    id: fieldId,
    label,
    source: "ExceptionEvent",
    category: "Exception Rules",
    needsDateRange: true,
    ruleId: rule.id,
    formatBucket: (v: number) => String(v),
    get: (d, ctx) => {
      const rec = (ctx.sources?.ExceptionEvent?.get(d.id) ?? null) as
        | Record<string, number>
        | null;
      return rec && rec[fieldId] != null ? String(rec[fieldId]) : "0";
    },
  };
}

function defaultDateRange(): IDateRangeValue {
  const last7 = GET_LAST_SEVEN_DAYS_OPTION();
  const range = last7.getRange();
  return { from: range.from, to: range.to, label: last7.label };
}

export default function App({ api, pageState }: AppProps) {
  const insideMyGeotab = api !== null;

  // --- Groups (loaded once) ---
  const [groupsById, setGroupsById] = useState<Map<string, GeotabGroup>>(new Map());
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [groupsErr, setGroupsErr] = useState<string | null>(null);

  // --- Rules (loaded once, surfaced as draggable Exception Rules fields) ---
  const [rulesLoaded, setRulesLoaded] = useState(false);
  const [, setRulesCount] = useState(0);

  // --- Toolbar state ---
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(["GroupCompanyId"]);
  const [dateRange, setDateRange] = useState<IDateRangeValue>(() => defaultDateRange());
  const [subPeriod, setSubPeriod] = useState<SubPeriod>("none");
  const [runBy, setRunBy] = useState<"individual" | "group">("individual");
  const [includeArchived, setIncludeArchived] = useState(false);

  // --- Field selection (ordered — column order = this list) ---
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([
    "name",
    "vin",
    "licensePlate",
  ]);

  // --- Build state ---
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildErr, setBuildErr] = useState<string | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);

  useEffect(() => {
    if (!api) return;
    fetchGroups(api)
      .then((map) => {
        setGroupsById(map);
        setGroupsLoaded(true);
      })
      .catch((err) => setGroupsErr(friendlyError(err)));
  }, [api]);

  useEffect(() => {
    if (!api) return;
    fetchRules(api)
      .then((rules) => {
        setDynamicFields(rules.map(ruleToField));
        setRulesCount(rules.length);
        setRulesLoaded(true);
      })
      .catch((err) => {
        console.error("[ARB] Failed to load rules:", err);
        setRulesLoaded(true); // don't block the picker forever
      });
  }, [api]);

  async function onBuild() {
    if (!api) return;
    setIsBuilding(true);
    setBuildErr(null);
    setResult(null);
    try {
      const buckets = computeBuckets(dateRange.from, dateRange.to, subPeriod);
      const ctx: BuildContext = {
        groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : ["GroupCompanyId"],
        fromDate: dateRange.from,
        toDate: dateRange.to,
        deviceIds: null,
        includeArchived,
        subPeriod,
        buckets,
        runBy,
        groupsById,
      };
      const r = await buildReport({ api, ctx, selectedFieldIds });
      setResult(r);
    } catch (err) {
      setBuildErr(friendlyError(err));
    } finally {
      setIsBuilding(false);
    }
  }

  const onDropdownChange =
    <T extends string>(setter: (v: T) => void) =>
    (items: ISelectionItem[]) => {
      const id = items[0]?.id;
      if (id) setter(id as T);
    };

  return (
    <div className="arb-page">
      <header
        className="arb-page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          marginBottom: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0, color: COLORS.navy, fontSize: 22 }}>Advanced Report Builder</h1>
          <p style={{ margin: "4px 0 0", color: "#5b6976", fontSize: 12 }}>
            v2.0 · Phase 2B.5 dynamic rules
          </p>
        </div>
        <Button
          type="primary"
          onClick={onBuild}
          disabled={!insideMyGeotab || isBuilding || !groupsLoaded}
        >
          {isBuilding ? "Building…" : "Build Report"}
        </Button>
      </header>

      {/* Native MyGeotab toolbar — single compact row, no labels, no card */}
      <div
        className="arb-toolbar"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        {groupsLoaded ? (
          <GroupFilterPicker
            groupsById={groupsById}
            initialGroupIds={selectedGroupIds}
            onChange={setSelectedGroupIds}
            onError={(e) => setBuildErr(friendlyError(e))}
          />
        ) : (
          <div style={{ color: "#6b7785", fontStyle: "italic", fontSize: 13 }}>Loading groups…</div>
        )}
        <DateRange
          options={dateRangeOptions}
          value={dateRange}
          defaultValue={dateRange}
          onChange={(v: IDateRangeValue) => setDateRange(v)}
          withCalendar
        />
        <Dropdown
          value={[subPeriod]}
          dataItems={subPeriodItems}
          onChange={onDropdownChange<SubPeriod>(setSubPeriod)}
          errorHandler={(e) => console.error("[ARB] Sub-period:", e)}
          forceSelection
          placeholder="Sub-period"
        />
        <Dropdown
          value={[runBy]}
          dataItems={runByItems}
          onChange={onDropdownChange<"individual" | "group">(setRunBy)}
          errorHandler={(e) => console.error("[ARB] Run by:", e)}
          forceSelection
          placeholder="Run by"
        />
        <Dropdown
          value={[includeArchived ? "include" : "exclude"]}
          dataItems={archivedItems}
          onChange={(items: ISelectionItem[]) => {
            const id = items[0]?.id;
            setIncludeArchived(id === "include");
          }}
          errorHandler={(e) => console.error("[ARB] Archived:", e)}
          forceSelection
          placeholder="Archived"
        />
      </div>

      <div className="arb-banner-stack" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {!insideMyGeotab && (
          <Banner type="info" header="Standalone preview">
            Open this page from inside MyGeotab to test the live integration.
          </Banner>
        )}
        {groupsErr && (
          <Banner type="error" header="Couldn't load groups">
            {groupsErr}
          </Banner>
        )}
        {buildErr && (
          <Banner type="error" header="Build failed">
            {buildErr}
          </Banner>
        )}
      </div>

      {/* Field selection — drag-and-drop palette + drop zone */}
      <Card title="Columns" fullWidth>
        <Content>
          <DragDropFieldPicker
            availableFields={getOptionalFields()}
            requiredFields={getRequiredFields()}
            selectedFieldIds={selectedFieldIds}
            onChange={setSelectedFieldIds}
          />
        </Content>
      </Card>

      {/* Results — Zenith Table (sortable, sticky header, resizable, column-visibility menu) */}
      {result && (
        <Card
          title={`Results · ${result.rows.length} row${result.rows.length === 1 ? "" : "s"} · ${
            result.runBy === "group" ? "aggregated by group" : "individual vehicles"
          }`}
          fullWidth
        >
          <Content>
            <ResultsTable result={result} />
          </Content>
        </Card>
      )}

      <div style={{ fontSize: 11, color: "#97a3b0", marginTop: 8 }}>
        Build: {import.meta.env.MODE} · API: {insideMyGeotab ? "connected" : "not connected"} ·
        PageState: {pageState ? "received" : "none"} · Groups loaded:{" "}
        {groupsLoaded ? `${groupsById.size}` : "no"} · Rules: {rulesLoaded ? "loaded" : "loading"} · Fields registered: {getAllFields().length}
      </div>
    </div>
  );
}
