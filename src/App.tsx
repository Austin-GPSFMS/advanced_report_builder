/**
 * Phase 1 smoke-test App.
 *
 * Goals:
 *   1. Prove the Vite + React 19 + TypeScript build pipeline produces a
 *      working bundle that MyGeotab can load inside its iframe.
 *   2. Confirm Zenith CSS is loaded (the page should pick up its design tokens
 *      via the @import in styles.css even though we don't render Zenith
 *      components in this minimal version).
 *   3. Verify the MyGeotab Add-In lifecycle hands us a usable `api` and
 *      `pageState` by making a real Get<User> call as a heartbeat.
 *
 * Phase 2 will replace the body with the real builder UI, using Zenith
 * components looked up from their actual TypeScript type definitions
 * (Banner, Card, Button, GroupsFilter, Table, Chart, etc.) — the API of each
 * one varies enough that we'll add them incrementally instead of guessing.
 */

import { useState } from "react";
import type { GeotabApi, GeotabPageState } from "./types";

interface AppProps {
  api: GeotabApi | null;
  pageState: GeotabPageState | null;
}

type PingState = "idle" | "loading" | "ok" | "fail";

const COLORS = {
  navy: "#25477B",
  blue: "#0084C2",
  blueSoft: "#E5F1F8",
  light: "#F4F4F4",
  dark: "#1C2B39",
  success: "#2E7D32",
  successSoft: "#E7F5E8",
  danger: "#C0392B",
  dangerSoft: "#FBEAE7",
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #D8DEE5",
  borderRadius: 6,
  padding: 16,
  boxShadow: "0 1px 2px rgba(28,43,57,0.08), 0 2px 8px rgba(28,43,57,0.04)",
};

const buttonPrimary: React.CSSProperties = {
  background: COLORS.navy,
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const buttonDisabled: React.CSSProperties = {
  ...buttonPrimary,
  background: "#A8B0BA",
  cursor: "not-allowed",
};

function Banner({
  appearance,
  title,
  body,
}: {
  appearance: "info" | "success" | "error";
  title: string;
  body: string;
}) {
  const bg =
    appearance === "success"
      ? COLORS.successSoft
      : appearance === "error"
      ? COLORS.dangerSoft
      : COLORS.blueSoft;
  const border =
    appearance === "success"
      ? COLORS.success
      : appearance === "error"
      ? COLORS.danger
      : COLORS.blue;
  return (
    <div
      style={{
        background: bg,
        borderLeft: `4px solid ${border}`,
        borderRadius: 4,
        padding: "10px 14px",
      }}
    >
      <div style={{ fontWeight: 700, color: border, fontSize: 13 }}>{title}</div>
      <div style={{ fontSize: 12, color: COLORS.dark, marginTop: 2 }}>{body}</div>
    </div>
  );
}

export default function App({ api, pageState }: AppProps) {
  const insideMyGeotab = api !== null;
  const [ping, setPing] = useState<PingState>("idle");
  const [pingMsg, setPingMsg] = useState("");

  function pingApi() {
    if (!api) return;
    setPing("loading");
    setPingMsg("Calling Get<User>...");
    api.call(
      "Get",
      { typeName: "User", resultsLimit: 1 },
      (result) => {
        const arr = Array.isArray(result) ? result : [];
        setPing("ok");
        setPingMsg(`API reachable — Get<User> returned ${arr.length} record(s).`);
      },
      (err) => {
        setPing("fail");
        setPingMsg("API call failed: " + String(err));
      }
    );
  }

  return (
    <div className="arb-page">
      <header className="arb-page-header">
        <div>
          <h1 style={{ margin: 0, color: COLORS.navy, fontSize: 22 }}>
            Advanced Report Builder
          </h1>
          <p style={{ margin: "4px 0 0", color: "#5b6976", fontSize: 13 }}>
            v2.0 · Zenith rebuild · Phase 1 scaffold
          </p>
        </div>
      </header>

      <div className="arb-banner-stack">
        {insideMyGeotab ? (
          <Banner
            appearance="success"
            title="Running inside MyGeotab"
            body="The add-in lifecycle initialized correctly. The MyGeotab API is wired up."
          />
        ) : (
          <Banner
            appearance="info"
            title="Standalone preview"
            body="No MyGeotab API detected. Open this page from inside MyGeotab to test the live integration."
          />
        )}
        <Banner
          appearance="info"
          title="React + TypeScript + Vite build pipeline"
          body="The new build pipeline produced this bundle and MyGeotab loaded it in the iframe — confirming Phase 1 deployment works end-to-end."
        />
      </div>

      <section style={card}>
        <h2 style={{ marginTop: 0, color: COLORS.navy, fontSize: 16 }}>
          Integration smoke test
        </h2>
        <p style={{ marginTop: 0, color: COLORS.dark, fontSize: 13 }}>
          Press the button below to call <code>Get&lt;User&gt;</code> against the MyGeotab API.
          A successful response means the api/pageState plumbing is healthy and we're ready to
          layer the filter bar, field palette, results table, and charts on top in Phase 2.
        </p>
        <button
          onClick={pingApi}
          disabled={!insideMyGeotab || ping === "loading"}
          style={!insideMyGeotab || ping === "loading" ? buttonDisabled : buttonPrimary}
        >
          {ping === "loading" ? "Pinging…" : "Ping MyGeotab API"}
        </button>
        {ping === "ok" && (
          <div style={{ marginTop: 12 }}>
            <Banner appearance="success" title="Success" body={pingMsg} />
          </div>
        )}
        {ping === "fail" && (
          <div style={{ marginTop: 12 }}>
            <Banner appearance="error" title="Failed" body={pingMsg} />
          </div>
        )}
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0, color: COLORS.navy, fontSize: 16 }}>What's next</h2>
        <p style={{ marginTop: 0, color: COLORS.dark, fontSize: 13 }}>
          Phase 2 ports the field registry, source fetchers, drag-and-drop palette, results
          table, and chart panel from the vanilla build — now backed by Zenith's GroupsFilter,
          Table, and Chart components.
        </p>
      </section>

      <div style={{ fontSize: 11, color: "#97a3b0", marginTop: 8 }}>
        Build: {import.meta.env.MODE} · API: {insideMyGeotab ? "connected" : "not connected"} ·
        PageState: {pageState ? "received" : "none"}
      </div>
    </div>
  );
}
