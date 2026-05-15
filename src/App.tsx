/**
 * Phase 2B.2 App — Zenith Banner / Button / Card / DateRange / Dropdown wired in
 * for a fully native MyGeotab feel. Behavior parity with Phase 2A unchanged.
 *
 *   Banner    → @geotab/zenith
 *   Button    → @geotab/zenith
 *   Card      → @geotab/zenith (with Content subcomponent)
 *   DateRange → @geotab/zenith (replaces Quick range + From + To)
 *   Dropdown  → @geotab/zenith (Sub-periods / Run by / Archived)
 *   GroupsFilter → @geotab/zenith (via ./components/GroupFilterPicker — done in 2B.1)
 */

import { useEffect, useMemo, useState } from "react";
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
import { fetchGroups, friendlyError } from "./api/geotab";
import { FIELD_REGISTRY, getOptionalFields, getRequiredFields } from "./registry/fields";
import { computeBuckets, type SubPeriod } from "./utils/dates";
import { buildReport } from "./utils/build";
import { GroupFilterPicker } from "./components/GroupFilterPicker";

interface AppProps {
  api: GeotabApi | null;
  pageState: GeotabPageState | null;
}

const COLORS = {
  navy: "#25477B",
  blue: "#0084C2",
  dark: "#1C2B39",
  light: "#F4F4F4",
  border: "#D8DEE5",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: COLORS.blue,
  fontWeight: 600,
  marginBottom: 4,
  display: "block",
};

// Sub-period / Run-by / Archived dropdown options.
const subPeriodItems = [
  { id: "none", name: "None (totals only)" },
  { id: "daily", name: "Daily" },
  { id: "weekly", name: "Weekly" },
  { id: "monthly", name: "Monthly" },
];
const runByItems = [
  { id: "individual", name: "Individual" },
  { id: "group", name: "Per Group" },
];
const archivedItems = [
  { id: "exclude", name: "Exclude" },
  { id: "include", name: "Include" },
];

// Date range presets we expose in the DateRange popup.
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

  // --- Filter bar state ---
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(["GroupCompanyId"]);
  const [dateRange, setDateRange] = useState<IDateRangeValue>(() => defaultDateRange());
  const [subPeriod, setSubPeriod] = useState<SubPeriod>("none");
  const [runBy, setRunBy] = useState<"individual" | "group">("individual");
  const [includeArchived, setIncludeArchived] = useState(false);

  // --- Field selection ---
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(["name", "vin", "licensePlate"])
  );

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

  function toggleField(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
      const r = await buildReport({
        api,
        ctx,
        selectedFieldIds: Array.from(selected),
      });
      setResult(r);
    } catch (err) {
      setBuildErr(friendlyError(err));
    } finally {
      setIsBuilding(false);
    }
  }

  const fieldsByCategory = useMemo(() => {
    const map = new Map<string, typeof FIELD_REGISTRY>();
    for (const f of getOptionalFields()) {
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category)!.push(f);
    }
    return map;
  }, []);

  const order = ["Vehicle Info", "Lifecycle", "Groups", "Live Status", "Measurements", "Exception Rules"];
  const orderedCats = order.filter((c) => fieldsByCategory.has(c));

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
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}
      >
        <div>
          <h1 style={{ margin: 0, color: COLORS.navy, fontSize: 22 }}>Advanced Report Builder</h1>
          <p style={{ margin: "4px 0 0", color: "#5b6976", fontSize: 12 }}>
            v2.0 · Phase 2B.2 native Zenith UI
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

      <div className="arb-banner-stack" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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

      {/* Filter bar */}
      <Card title="Filters" fullWidth>
        <Content>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
            <div style={{ minWidth: 220 }}>
              <label style={labelStyle}>Group</label>
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
            </div>
            <div>
              <label style={labelStyle}>Date range</label>
              <DateRange
                options={dateRangeOptions}
                value={dateRange}
                defaultValue={dateRange}
                onChange={(v: IDateRangeValue) => setDateRange(v)}
              />
            </div>
            <div style={{ minWidth: 180 }}>
              <label style={labelStyle}>Sub-periods</label>
              <Dropdown
                value={[subPeriod]}
                dataItems={subPeriodItems}
                onChange={onDropdownChange<SubPeriod>(setSubPeriod)}
                errorHandler={(e) => console.error("[ARB] Sub-period:", e)}
                forceSelection
                placeholder="None"
              />
            </div>
            <div style={{ minWidth: 160 }}>
              <label style={labelStyle}>Run by</label>
              <Dropdown
                value={[runBy]}
                dataItems={runByItems}
                onChange={onDropdownChange<"individual" | "group">(setRunBy)}
                errorHandler={(e) => console.error("[ARB] Run by:", e)}
                forceSelection
                placeholder="Individual"
              />
            </div>
            <div style={{ minWidth: 140 }}>
              <label style={labelStyle}>Archived</label>
              <Dropdown
                value={[includeArchived ? "include" : "exclude"]}
                dataItems={archivedItems}
                onChange={(items: ISelectionItem[]) => {
                  const id = items[0]?.id;
                  setIncludeArchived(id === "include");
                }}
                errorHandler={(e) => console.error("[ARB] Archived:", e)}
                forceSelection
                placeholder="Exclude"
              />
            </div>
          </div>
        </Content>
      </Card>

      {/* Field selection */}
      <Card title="Columns" fullWidth>
        <Content>
          <div style={{ fontSize: 11, color: "#6b7785", marginBottom: 8 }}>
            Device ID and Geotab Serial are always included. Check additional fields below.
          </div>
          {orderedCats.map((cat) => (
            <details key={cat} open={cat !== "Exception Rules"} style={{ marginBottom: 8 }}>
              <summary
                style={{
                  cursor: "pointer",
                  fontWeight: 700,
                  color: COLORS.navy,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                {cat}{" "}
                <span style={{ color: "#6b7785", fontWeight: 400 }}>
                  ({fieldsByCategory.get(cat)!.length})
                </span>
              </summary>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "8px 0 0 0" }}>
                {fieldsByCategory.get(cat)!.map((f) => (
                  <label
                    key={f.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      padding: "4px 10px",
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 14,
                      cursor: "pointer",
                      background: selected.has(f.id) ? "#E5F1F8" : "#FFFFFF",
                      color: selected.has(f.id) ? COLORS.navy : COLORS.dark,
                      fontWeight: selected.has(f.id) ? 600 : 400,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(f.id)}
                      onChange={() => toggleField(f.id)}
                      style={{ margin: 0 }}
                    />
                    {f.label}
                    {f.needsDateRange && (
                      <span style={{ color: "#2E7D32", fontSize: 9 }}>· date</span>
                    )}
                  </label>
                ))}
              </div>
            </details>
          ))}
          <div style={{ fontSize: 11, color: "#6b7785", marginTop: 12 }}>
            Always included: {getRequiredFields().map((f) => f.label).join(", ")}
          </div>
        </Content>
      </Card>

      {/* Results */}
      {result && (
        <Card title={`Results · ${result.rows.length} row${result.rows.length === 1 ? "" : "s"} · ${result.runBy === "group" ? "aggregated by group" : "individual vehicles"}`} fullWidth>
          <Content>
            <div style={{ maxHeight: "50vh", overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {result.columns.map((c) => (
                      <th
                        key={c.key}
                        style={{
                          background: COLORS.navy,
                          color: "#FFFFFF",
                          padding: "8px 12px",
                          textAlign: "left",
                          position: "sticky",
                          top: 0,
                          whiteSpace: "nowrap",
                          fontSize: 11,
                          letterSpacing: 0.3,
                          fontWeight: 700,
                        }}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr
                      key={String(row._deviceId)}
                      style={{ background: i % 2 ? COLORS.light : "#FFFFFF" }}
                    >
                      {result.columns.map((c) => {
                        const v = row[c.key];
                        return (
                          <td
                            key={c.key}
                            style={{
                              padding: "6px 12px",
                              borderBottom: "1px solid #eef1f4",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {v == null || v === ""
                              ? ""
                              : Array.isArray(v)
                              ? v.join(", ")
                              : typeof v === "object"
                              ? JSON.stringify(v)
                              : String(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Content>
        </Card>
      )}

      <div style={{ fontSize: 11, color: "#97a3b0", marginTop: 8 }}>
        Build: {import.meta.env.MODE} · API: {insideMyGeotab ? "connected" : "not connected"} ·
        PageState: {pageState ? "received" : "none"} · Groups loaded:{" "}
        {groupsLoaded ? `${groupsById.size}` : "no"} · Fields registered: {FIELD_REGISTRY.length}
      </div>
    </div>
  );
}
