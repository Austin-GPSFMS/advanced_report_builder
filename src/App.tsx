/**
 * Phase 2A App — functional report builder with minimal UI.
 *
 * Filter bar (group, date range, sub-period, run-by, archived) drives a
 * build() call that uses the new src/registry + src/utils modules. Results
 * render in a plain HTML table.
 *
 * Phase 2B will replace this UI with Zenith components + dnd-kit palette.
 */

import { useEffect, useMemo, useState } from "react";
import type {
  BuildContext,
  GeotabApi,
  GeotabGroup,
  GeotabPageState,
  ReportResult,
} from "./types";
import { fetchGroups, friendlyError } from "./api/geotab";
import { FIELD_REGISTRY, getOptionalFields, getRequiredFields } from "./registry/fields";
import { applyDatePreset, computeBuckets, isoDateOnly, parseDate, type DatePreset, type SubPeriod } from "./utils/dates";
import { buildReport } from "./utils/build";
import { GroupFilterPicker } from "./components/GroupFilterPicker";

interface AppProps {
  api: GeotabApi | null;
  pageState: GeotabPageState | null;
}

const COLORS = {
  navy: "#25477B",
  blue: "#0084C2",
  blueSoft: "#E5F1F8",
  light: "#F4F4F4",
  border: "#D8DEE5",
  dark: "#1C2B39",
  success: "#2E7D32",
  successSoft: "#E7F5E8",
  danger: "#C0392B",
  dangerSoft: "#FBEAE7",
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: `1px solid ${COLORS.border}`,
  borderRadius: 6,
  padding: 16,
  boxShadow: "0 1px 2px rgba(28,43,57,0.08), 0 2px 8px rgba(28,43,57,0.04)",
};

const inputStyle: React.CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 4,
  padding: "6px 10px",
  fontSize: 13,
  fontFamily: "inherit",
  background: "#FFFFFF",
};

const btnPrimary: React.CSSProperties = {
  background: COLORS.navy,
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const btnDisabled: React.CSSProperties = { ...btnPrimary, background: "#A8B0BA", cursor: "not-allowed" };

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: COLORS.blue,
  fontWeight: 600,
  marginBottom: 4,
  display: "block",
};

function Banner({ appearance, title, body }: { appearance: "info" | "success" | "error"; title: string; body: string }) {
  const bg = appearance === "success" ? COLORS.successSoft : appearance === "error" ? COLORS.dangerSoft : COLORS.blueSoft;
  const border = appearance === "success" ? COLORS.success : appearance === "error" ? COLORS.danger : COLORS.blue;
  return (
    <div style={{ background: bg, borderLeft: `4px solid ${border}`, borderRadius: 4, padding: "10px 14px" }}>
      <div style={{ fontWeight: 700, color: border, fontSize: 13 }}>{title}</div>
      <div style={{ fontSize: 12, color: COLORS.dark, marginTop: 2, whiteSpace: "pre-wrap" }}>{body}</div>
    </div>
  );
}

export default function App({ api, pageState }: AppProps) {
  const insideMyGeotab = api !== null;

  // --- Groups (loaded once) ---
  const [groupsById, setGroupsById] = useState<Map<string, GeotabGroup>>(new Map());
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [groupsErr, setGroupsErr] = useState<string | null>(null);

  // --- Filter bar state ---
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(["GroupCompanyId"]);
  const [preset, setPreset] = useState<DatePreset>("7d");
  const initial7d = applyDatePreset("7d");
  const [fromDateStr, setFromDateStr] = useState(initial7d ? isoDateOnly(initial7d.from) : "");
  const [toDateStr, setToDateStr] = useState(initial7d ? isoDateOnly(initial7d.to) : "");
  const [subPeriod, setSubPeriod] = useState<SubPeriod>("none");
  const [runBy, setRunBy] = useState<"individual" | "group">("individual");
  const [includeArchived, setIncludeArchived] = useState(false);

  // --- Field selection ---
  const [selected, setSelected] = useState<Set<string>>(() => new Set(["name", "vin", "licensePlate"]));

  // --- Build state ---
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildErr, setBuildErr] = useState<string | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);

  // Load groups once on mount.
  useEffect(() => {
    if (!api) return;
    fetchGroups(api)
      .then((map) => {
        setGroupsById(map);
        setGroupsLoaded(true);
      })
      .catch((err) => setGroupsErr(friendlyError(err)));
  }, [api]);

  // When the preset changes, sync dates. Custom leaves them alone.
  function onPresetChange(next: DatePreset) {
    setPreset(next);
    const r = applyDatePreset(next);
    if (r) {
      setFromDateStr(isoDateOnly(r.from));
      setToDateStr(isoDateOnly(r.to));
    }
  }

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
      const fromDate = parseDate(fromDateStr);
      const toDate = parseDate(toDateStr);
      const buckets = computeBuckets(fromDate, toDate, subPeriod);
      const ctx: BuildContext = {
        groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : ["GroupCompanyId"],
        fromDate,
        toDate,
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

  // Group fields by category for the palette section.
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

  return (
    <div className="arb-page">
      <header className="arb-page-header">
        <div>
          <h1 style={{ margin: 0, color: COLORS.navy, fontSize: 22 }}>Advanced Report Builder</h1>
          <p style={{ margin: "4px 0 0", color: "#5b6976", fontSize: 12 }}>v2.0 · Phase 2A functional report builder</p>
        </div>
        <button
          onClick={onBuild}
          disabled={!insideMyGeotab || isBuilding || !groupsLoaded}
          style={!insideMyGeotab || isBuilding || !groupsLoaded ? btnDisabled : btnPrimary}
        >
          {isBuilding ? "Building…" : "Build Report"}
        </button>
      </header>

      {!insideMyGeotab && (
        <Banner appearance="info" title="Standalone preview" body="Open this page from inside MyGeotab to test the live integration." />
      )}
      {groupsErr && <Banner appearance="error" title="Couldn't load groups" body={groupsErr} />}
      {buildErr && <Banner appearance="error" title="Build failed" body={buildErr} />}

      {/* Filter bar */}
      <section style={card}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
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
              <div style={{ ...inputStyle, color: "#6b7785", fontStyle: "italic" }}>Loading groups…</div>
            )}
          </div>
          <div>
            <label style={labelStyle}>Quick range</label>
            <select style={inputStyle} value={preset} onChange={(e) => onPresetChange(e.target.value as DatePreset)}>
              <option value="custom">Custom</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="thisweek">This week</option>
              <option value="lastweek">Last week</option>
              <option value="thismonth">This month</option>
              <option value="lastmonth">Last month</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>From</label>
            <input style={inputStyle} type="date" value={fromDateStr} onChange={(e) => { setFromDateStr(e.target.value); setPreset("custom"); }} />
          </div>
          <div>
            <label style={labelStyle}>To</label>
            <input style={inputStyle} type="date" value={toDateStr} onChange={(e) => { setToDateStr(e.target.value); setPreset("custom"); }} />
          </div>
          <div>
            <label style={labelStyle}>Sub-periods</label>
            <select style={inputStyle} value={subPeriod} onChange={(e) => setSubPeriod(e.target.value as SubPeriod)}>
              <option value="none">None (totals only)</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Run by</label>
            <select style={inputStyle} value={runBy} onChange={(e) => setRunBy(e.target.value as "individual" | "group")}>
              <option value="individual">Individual</option>
              <option value="group">Per Group</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Archived</label>
            <select style={inputStyle} value={includeArchived ? "include" : "exclude"} onChange={(e) => setIncludeArchived(e.target.value === "include")}>
              <option value="exclude">Exclude</option>
              <option value="include">Include</option>
            </select>
          </div>
        </div>
      </section>

      {/* Field selection (Phase 2B will swap this for the drag-drop palette) */}
      <section style={card}>
        <h2 style={{ marginTop: 0, color: COLORS.navy, fontSize: 14, textTransform: "uppercase", letterSpacing: 0.4 }}>Columns</h2>
        <div style={{ fontSize: 11, color: "#6b7785", marginBottom: 8 }}>
          Device ID and Geotab Serial are always included. Check additional fields below.
        </div>
        {orderedCats.map((cat) => (
          <details key={cat} open={cat !== "Exception Rules"} style={{ marginBottom: 8 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, color: COLORS.navy, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 }}>
              {cat} <span style={{ color: "#6b7785", fontWeight: 400 }}>({fieldsByCategory.get(cat)!.length})</span>
            </summary>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "8px 0 0 0" }}>
              {fieldsByCategory.get(cat)!.map((f) => (
                <label key={f.id} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontSize: 12, padding: "4px 10px", border: `1px solid ${COLORS.border}`,
                  borderRadius: 14, cursor: "pointer",
                  background: selected.has(f.id) ? COLORS.blueSoft : "#FFFFFF",
                  color: selected.has(f.id) ? COLORS.navy : COLORS.dark,
                  fontWeight: selected.has(f.id) ? 600 : 400,
                }}>
                  <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleField(f.id)} style={{ margin: 0 }} />
                  {f.label}
                  {f.needsDateRange && <span style={{ color: COLORS.success, fontSize: 9 }}>· date</span>}
                </label>
              ))}
            </div>
          </details>
        ))}
      </section>

      {/* Required columns (info only — always included) */}
      <div style={{ fontSize: 11, color: "#6b7785" }}>
        Always included: {getRequiredFields().map((f) => f.label).join(", ")}
      </div>

      {/* Results table */}
      {result && (
        <section style={{ ...card, padding: 0, overflow: "auto" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.light }}>
            <span style={{ fontWeight: 700, color: COLORS.navy, fontSize: 13 }}>Results</span>{" "}
            <span style={{ fontSize: 11, color: "#6b7785" }}>· {result.rows.length} row{result.rows.length === 1 ? "" : "s"} · {result.runBy === "group" ? "aggregated by group" : "individual vehicles"}</span>
          </div>
          <div style={{ maxHeight: "50vh", overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {result.columns.map((c) => (
                    <th key={c.key} style={{
                      background: COLORS.navy, color: "#FFFFFF",
                      padding: "8px 12px", textAlign: "left",
                      position: "sticky", top: 0, whiteSpace: "nowrap",
                      fontSize: 11, letterSpacing: 0.3, fontWeight: 700,
                    }}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={String(row._deviceId)} style={{ background: i % 2 ? COLORS.light : "#FFFFFF" }}>
                    {result.columns.map((c) => {
                      const v = row[c.key];
                      return (
                        <td key={c.key} style={{ padding: "6px 12px", borderBottom: "1px solid #eef1f4", whiteSpace: "nowrap" }}>
                          {v == null || v === "" ? "" : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div style={{ fontSize: 11, color: "#97a3b0", marginTop: 8 }}>
        Build: {import.meta.env.MODE} · API: {insideMyGeotab ? "connected" : "not connected"} · PageState: {pageState ? "received" : "none"} · Groups loaded: {groupsLoaded ? `${groupsById.size}` : "no"} · Fields registered: {FIELD_REGISTRY.length}
      </div>
    </div>
  );
}
