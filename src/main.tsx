/**
 * Entry point.
 *
 * The MyGeotab add-in lifecycle calls a function registered at
 *   window.geotab.addin.advancedReportBuilder
 * which returns { initialize, focus, blur }.
 *
 *   initialize(api, state, callback)   — MyGeotab calls this when the page mounts.
 *                                        We create the React root here and pass api+state into App.
 *   focus(api, state)                  — Called when the page gains focus.
 *                                        We re-render App with the (possibly refreshed) api/state.
 *   blur()                             — Called when the page loses focus. No-op for now.
 *
 * For standalone testing (opening the dist/index.html directly in a browser
 * outside MyGeotab), we render a stub App with no api so the page still paints.
 */

import { StrictMode } from "react";
import { createRoot, Root } from "react-dom/client";
import App from "./App";
import type { GeotabApi, GeotabPageState } from "./types";
import "./styles.css";

declare global {
  interface Window {
    geotab?: {
      addin?: Record<string, () => {
        initialize: (api: GeotabApi, state: GeotabPageState, callback: () => void) => void;
        focus: (api: GeotabApi, state: GeotabPageState) => void;
        blur: () => void;
      }>;
    };
  }
}

let root: Root | null = null;
let currentApi: GeotabApi | null = null;
let currentState: GeotabPageState | null = null;

function mount() {
  const container = document.getElementById("root");
  if (!container) {
    console.error("[ARB] #root element not found");
    return;
  }
  if (!root) {
    root = createRoot(container);
  }
  root.render(
    <StrictMode>
      <App api={currentApi} pageState={currentState} />
    </StrictMode>
  );
}

window.geotab = window.geotab || {};
window.geotab.addin = window.geotab.addin || {};
window.geotab.addin.advancedReportBuilder = function () {
  return {
    initialize(api, state, callback) {
      currentApi = api;
      currentState = state;
      try {
        mount();
      } catch (e) {
        console.error("[ARB] initialize failed:", e);
      }
      callback();
    },
    focus(api, state) {
      currentApi = api;
      currentState = state;
      // Re-render so the App can react to any state changes (group filter etc.).
      mount();
    },
    blur() {
      // No-op. Hook here if we ever need to cancel inflight requests.
    },
  };
};

// Standalone load (opening dist/index.html directly in a browser without
// MyGeotab): paint the App with no api so users see something.
if (typeof window !== "undefined") {
  const standaloneTimer = window.setTimeout(() => {
    if (!root) {
      console.warn("[ARB] No MyGeotab initialize() call detected — rendering standalone preview.");
      mount();
    }
  }, 500);

  // If MyGeotab calls initialize fast, cancel the standalone fallback.
  const origInit = window.geotab!.addin!.advancedReportBuilder;
  window.geotab!.addin!.advancedReportBuilder = function () {
    window.clearTimeout(standaloneTimer);
    return origInit();
  };
}
