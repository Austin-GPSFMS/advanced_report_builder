/**
 * Source fetchers — one per Geotab entity type we pull data from.
 *
 * Each source receives the active BuildContext and returns a Map keyed by
 * device.id holding whatever payload the fields of that source need.
 *
 *   Device           -> the full Device record itself (for static fields).
 *   DeviceStatusInfo -> point-in-time live status snapshot per device.
 *   StatusData       -> diagnostic deltas (and per-bucket deltas) per device.
 *   ExceptionEvent   -> per-rule event counts (and per-bucket counts) per device.
 */

import type {
  BuildContext,
  FieldDefinition,
  GeotabApi,
  GeotabDevice,
  SourceName,
} from "../types";
import { apiCall } from "../api/geotab";
import { getAllFields } from "./fields";

export type SourceMap = Map<string, unknown>;

interface SourceDef {
  fetch: (api: GeotabApi, ctx: BuildContext) => Promise<SourceMap>;
}

/** Field entries (static + dynamic) for the given source that are active in this build. */
function activeFieldsForSource(ctx: BuildContext, source: SourceName): FieldDefinition[] {
  const ids = ctx.activeFieldIds ?? [];
  return getAllFields().filter((f) => f.source === source && ids.includes(f.id));
}

function inDeviceFilter(ctx: BuildContext, deviceId: string): boolean {
  if (!ctx.deviceIds || ctx.deviceIds.length === 0) return true;
  return ctx.deviceIds.includes(deviceId);
}

/** Device source — one Get<Device> call, optionally narrowed by deviceIds + archived filter. */
const DeviceSource: SourceDef = {
  async fetch(api, ctx) {
    const search =
      ctx.groupIds.length > 0
        ? { groups: ctx.groupIds.map((id) => ({ id })) }
        : { groups: [{ id: "GroupCompanyId" }] };
    const devices = await apiCall<GeotabDevice[]>(api, "Get", {
      typeName: "Device",
      search,
      resultsLimit: 50000,
    });
    const byId = new Map<string, unknown>();
    const now = Date.now();
    for (const d of devices) {
      if (!ctx.includeArchived && d.activeTo) {
        const t = new Date(d.activeTo).getTime();
        if (!isNaN(t) && t < now) continue;
      }
      if (!inDeviceFilter(ctx, d.id)) continue;
      byId.set(d.id, d);
    }
    return byId;
  },
};

/** DeviceStatusInfo — one call, returns the live snapshot per device. */
const DeviceStatusInfoSource: SourceDef = {
  async fetch(api, ctx) {
    const groupSearch = ctx.groupIds.length > 0
      ? ctx.groupIds.map((id) => ({ id }))
      : [{ id: "GroupCompanyId" }];
    const infos = await apiCall<Array<{ device?: { id: string } } & Record<string, unknown>>>(
      api,
      "Get",
      {
        typeName: "DeviceStatusInfo",
        search: { deviceSearch: { groups: groupSearch } },
        resultsLimit: 50000,
      }
    );
    const byId = new Map<string, unknown>();
    for (const i of infos) {
      if (!i?.device) continue;
      if (!inDeviceFilter(ctx, i.device.id)) continue;
      byId.set(i.device.id, i);
    }
    return byId;
  },
};

interface StatusDataRecord {
  device?: { id: string };
  dateTime?: string;
  data?: number;
}

/**
 * StatusData — one Get<StatusData> call per active diagnostic. Computes both
 * (last - first) total delta and, when buckets are active, per-bucket deltas.
 */
const StatusDataSource: SourceDef = {
  async fetch(api, ctx) {
    const statusFields = activeFieldsForSource(ctx, "StatusData");
    if (statusFields.length === 0) return new Map();
    if (!ctx.fromDate || !ctx.toDate) {
      throw new Error("Distance and Engine Hours need a From and To date — pick a range above.");
    }
    const fromIso = ctx.fromDate.toISOString();
    const toIso = ctx.toDate.toISOString();
    const groupSearch =
      ctx.groupIds.length > 0
        ? ctx.groupIds.map((id) => ({ id }))
        : [{ id: "GroupCompanyId" }];

    const calls = statusFields.map((f) =>
      apiCall<StatusDataRecord[]>(api, "Get", {
        typeName: "StatusData",
        search: {
          fromDate: fromIso,
          toDate: toIso,
          diagnosticSearch: { id: f.diagnostic },
          deviceSearch: { groups: groupSearch },
        },
        resultsLimit: 50000,
      })
    );

    const allResults = await Promise.all(calls);
    const byDevice = new Map<string, Record<string, number | number[]>>();

    statusFields.forEach((f, idx) => {
      const records = allResults[idx] ?? [];
      // First & last reading per device (total delta).
      const first: Record<string, { t: number; v: number }> = {};
      const last: Record<string, { t: number; v: number }> = {};
      // Same per (device, bucket) when buckets are active.
      const firstBuck: Record<string, { t: number; v: number }> = {};
      const lastBuck: Record<string, { t: number; v: number }> = {};

      for (const r of records) {
        if (!r?.device?.id || !r.dateTime || typeof r.data !== "number") continue;
        const did = r.device.id;
        const t = new Date(r.dateTime).getTime();
        if (!first[did] || t < first[did].t) first[did] = { t, v: r.data };
        if (!last[did] || t > last[did].t) last[did] = { t, v: r.data };
        if (ctx.buckets) {
          for (let bi = 0; bi < ctx.buckets.length; bi++) {
            const b = ctx.buckets[bi];
            if (t >= b.start.getTime() && t <= b.end.getTime()) {
              const key = `${did}_${bi}`;
              if (!firstBuck[key] || t < firstBuck[key].t) firstBuck[key] = { t, v: r.data };
              if (!lastBuck[key] || t > lastBuck[key].t) lastBuck[key] = { t, v: r.data };
            }
          }
        }
      }

      const factor = f.unitFactor ?? 1;
      for (const did of Object.keys(first)) {
        if (!inDeviceFilter(ctx, did)) continue;
        let rec = byDevice.get(did);
        if (!rec) {
          rec = {};
          byDevice.set(did, rec);
        }
        rec[f.id] = (last[did].v - first[did].v) * factor;
        if (ctx.buckets) {
          const arr: number[] = [];
          for (let bi = 0; bi < ctx.buckets.length; bi++) {
            const key = `${did}_${bi}`;
            arr.push(
              firstBuck[key] && lastBuck[key]
                ? (lastBuck[key].v - firstBuck[key].v) * factor
                : NaN
            );
          }
          rec[`${f.id}__buckets`] = arr;
        }
      }
    });

    return byDevice as SourceMap;
  },
};

interface ExceptionEventRecord {
  device?: { id: string };
  activeFrom?: string;
}

/** ExceptionEvent — one call per active rule field; counts per device (and per bucket). */
const ExceptionEventSource: SourceDef = {
  async fetch(api, ctx) {
    const exFields = activeFieldsForSource(ctx, "ExceptionEvent");
    if (exFields.length === 0) return new Map();
    if (!ctx.fromDate || !ctx.toDate) {
      throw new Error("Event-count fields need a From and To date — pick a range above.");
    }
    const fromIso = ctx.fromDate.toISOString();
    const toIso = ctx.toDate.toISOString();
    const groupSearch =
      ctx.groupIds.length > 0
        ? ctx.groupIds.map((id) => ({ id }))
        : [{ id: "GroupCompanyId" }];

    const calls = exFields.map((f) => {
      const search: Record<string, unknown> = {
        fromDate: fromIso,
        toDate: toIso,
        deviceSearch: { groups: groupSearch },
      };
      if (f.ruleId) search.ruleSearch = { id: f.ruleId };
      return apiCall<ExceptionEventRecord[]>(api, "Get", {
        typeName: "ExceptionEvent",
        search,
        resultsLimit: 50000,
      });
    });

    const allResults = await Promise.all(calls);
    const byDevice = new Map<string, Record<string, number | number[]>>();

    exFields.forEach((f, idx) => {
      const events = allResults[idx] ?? [];
      for (const e of events) {
        if (!e?.device?.id) continue;
        if (!inDeviceFilter(ctx, e.device.id)) continue;
        const did = e.device.id;
        let rec = byDevice.get(did);
        if (!rec) {
          rec = {};
          byDevice.set(did, rec);
        }
        rec[f.id] = ((rec[f.id] as number | undefined) ?? 0) + 1;
        if (ctx.buckets && e.activeFrom) {
          const key = `${f.id}__buckets`;
          let arr = rec[key] as number[] | undefined;
          if (!arr) {
            arr = ctx.buckets.map(() => 0);
            rec[key] = arr;
          }
          const t = new Date(e.activeFrom).getTime();
          for (let bi = 0; bi < ctx.buckets.length; bi++) {
            const b = ctx.buckets[bi];
            if (t >= b.start.getTime() && t <= b.end.getTime()) {
              arr[bi]++;
              break;
            }
          }
        }
      }
    });

    return byDevice as SourceMap;
  },
};

export const SOURCES: Record<SourceName, SourceDef> = {
  Device: DeviceSource,
  DeviceStatusInfo: DeviceStatusInfoSource,
  StatusData: StatusDataSource,
  ExceptionEvent: ExceptionEventSource,
  // Trip reserved for later — present in the SourceName union so the type
  // system catches use-before-implementation.
  Trip: {
    async fetch() {
      return new Map();
    },
  },
};
