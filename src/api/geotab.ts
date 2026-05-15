/**
 * Promise-based wrappers around the MyGeotab Add-In `api.call` interface.
 *
 * The MyGeotab API is callback-style:
 *     api.call(method, params, successCb, failureCb)
 * Every fetcher in the report builder funnels through `apiCall<T>()` so we
 * get a Promise-based interface, typed return values, and a small inter-call
 * breather to be polite to the rate limiter.
 *
 * See https://developers.geotab.com/myGeotab/guides/rateLimits — Authenticate
 * is hard-capped at 10/min; Get is more generous but still worth pacing.
 */

import type { GeotabApi, GeotabDevice, GeotabGroup } from "../types";

/** Small spacing between back-to-back calls (rate-limit politeness). */
const INTER_CALL_DELAY_MS = 50;

/** Generic typed call wrapper. Resolves with the API result, rejects on failure. */
export function apiCall<T = unknown>(
  api: GeotabApi,
  method: string,
  params: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      api.call(
        method,
        params,
        (result) => {
          setTimeout(() => resolve(result as T), INTER_CALL_DELAY_MS);
        },
        (err) => reject(err)
      );
    } catch (err) {
      reject(err);
    }
  });
}

/** Make a fetch error nice to display to humans. */
export function friendlyError(err: unknown): string {
  if (err == null) return "Unknown error.";
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const e = err as { name?: string; message?: string };
    if (e.name === "InvalidUserException" || /InvalidUser/i.test(String(err))) {
      return "Session expired — refresh the MyGeotab page to re-authenticate.";
    }
    if (e.message) return e.message;
  }
  return String(err);
}

/** Fetch the full Group list and return it keyed by id. */
export async function fetchGroups(api: GeotabApi): Promise<Map<string, GeotabGroup>> {
  const groups = await apiCall<GeotabGroup[]>(api, "Get", {
    typeName: "Group",
    resultsLimit: 5000,
  });
  return new Map(groups.map((g) => [g.id, g]));
}

/** A single Geotab Rule — only fields we surface in the report builder. */
export interface GeotabRule {
  id: string;
  name?: string;
  isBuiltIn?: boolean;
  comment?: string;
}

/**
 * Fetch every Rule (built-in + customer-defined). Used by Phase 2B.5 to
 * surface a per-rule field card in the Exception Rules palette so reports
 * can include exception counts for any rule without code changes.
 */
export async function fetchRules(api: GeotabApi): Promise<GeotabRule[]> {
  const rules = await apiCall<GeotabRule[]>(api, "Get", {
    typeName: "Rule",
    resultsLimit: 5000,
  });
  return rules.slice().sort((a, b) => {
    const an = (a.name ?? a.id).toLowerCase();
    const bn = (b.name ?? b.id).toLowerCase();
    return an.localeCompare(bn);
  });
}

export interface GeotabCustomProperty {
  id: string;
  name?: string;
  description?: string;
  dataType?: string;
}

/**
 * Fetch the universe of Custom Property definitions to surface as
 * draggable field cards. Two strategies, tried in order:
 *
 *   1. Get<CustomProperty> — works on databases where Geotab exposes the
 *      property definitions as their own type.
 *   2. Get<Device> sample, then derive unique property names from each
 *      device.propertyValues entry. Geotab always returns these inline
 *      on Device records, so this fallback is the safety net.
 */
export async function fetchCustomProperties(api: GeotabApi): Promise<GeotabCustomProperty[]> {
  const sortByName = (list: GeotabCustomProperty[]) =>
    list.slice().sort((a, b) => {
      const an = (a.name ?? a.id).toLowerCase();
      const bn = (b.name ?? b.id).toLowerCase();
      return an.localeCompare(bn);
    });

  // Strategy 1: explicit CustomProperty typeName.
  try {
    const props = await apiCall<GeotabCustomProperty[]>(api, "Get", {
      typeName: "CustomProperty",
      resultsLimit: 5000,
    });
    if (Array.isArray(props) && props.length > 0) {
      console.log("[ARB] Loaded", props.length, "custom properties via Get<CustomProperty>");
      return sortByName(props);
    }
    console.log("[ARB] Get<CustomProperty> returned 0 items — falling back to device-derived");
  } catch (err) {
    console.warn("[ARB] Get<CustomProperty> failed; falling back to device-derived:", err);
  }

  // Strategy 2: derive from device.propertyValues.
  try {
    interface DeviceLite {
      propertyValues?: Array<{ property?: { id?: string; name?: string } }>;
    }
    const devices = await apiCall<DeviceLite[]>(api, "Get", {
      typeName: "Device",
      resultsLimit: 1000,
    });
    const byKey = new Map<string, GeotabCustomProperty>();
    for (const d of devices) {
      const pvs = d.propertyValues ?? [];
      for (const pv of pvs) {
        const id = pv.property?.id ?? "";
        const name = pv.property?.name ?? "";
        // Key by id when present, otherwise by name; skip entries without either.
        const key = id || name;
        if (!key) continue;
        if (!byKey.has(key)) {
          byKey.set(key, { id: id || name, name });
        }
      }
    }
    const list = sortByName(Array.from(byKey.values()));
    console.log("[ARB] Derived", list.length, "custom properties from device.propertyValues");
    return list;
  } catch (err) {
    console.warn("[ARB] Device-derived custom property fallback failed:", err);
    return [];
  }
}

/** Fetch devices in any of the given groups. Optionally drops archived devices. */
export async function fetchDevices(
  api: GeotabApi,
  groupIds: string[],
  includeArchived: boolean
): Promise<GeotabDevice[]> {
  const search =
    groupIds.length > 0
      ? { groups: groupIds.map((id) => ({ id })) }
      : { groups: [{ id: "GroupCompanyId" }] };
  const devices = await apiCall<GeotabDevice[]>(api, "Get", {
    typeName: "Device",
    search,
    resultsLimit: 50000,
  });
  if (includeArchived) return devices;
  const now = Date.now();
  return devices.filter((d) => {
    if (!d.activeTo) return true;
    const t = new Date(d.activeTo).getTime();
    return isNaN(t) ? true : t > now;
  });
}
