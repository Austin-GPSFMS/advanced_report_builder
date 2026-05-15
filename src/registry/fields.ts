/**
 * Field registry — every draggable column in the report builder.
 *
 * Categories control palette grouping (Vehicle Info / Lifecycle / Groups /
 * Live Status / Measurements / Exception Rules). `source` controls which
 * fetcher the field's value comes from. `required: true` pins a field as
 * always-present (Device ID, Geotab Serial).
 *
 * Ported 1:1 from the vanilla build so reports compute identical values.
 */

import type { FieldDefinition, GeotabDevice, BuildContext } from "../types";
import { formatDate, formatDateTime } from "../utils/dates";
import { resolveGroupNames, computeParentGroup } from "../utils/groups";

const dsi = (deviceId: string, ctx: BuildContext) =>
  (ctx.sources?.DeviceStatusInfo?.get(deviceId) ?? null) as
    | {
        dateTime?: string;
        isDriving?: boolean;
        isDeviceCommunicating?: boolean;
        speed?: number;
        latitude?: number;
        longitude?: number;
        previousTripStart?: string;
        previousTripEnd?: string;
      }
    | null;

const sd = (deviceId: string, ctx: BuildContext) =>
  (ctx.sources?.StatusData?.get(deviceId) ?? null) as Record<string, number> | null;

const ee = (deviceId: string, ctx: BuildContext) =>
  (ctx.sources?.ExceptionEvent?.get(deviceId) ?? null) as Record<string, number> | null;

export const FIELD_REGISTRY: FieldDefinition[] = [
  // --- Required keys ---
  {
    id: "deviceId",
    label: "Device ID",
    source: "Device",
    category: "Vehicle Info",
    required: true,
    get: (d) => d.id,
  },
  {
    id: "serial",
    label: "Geotab Serial",
    source: "Device",
    category: "Vehicle Info",
    required: true,
    get: (d) => d.serialNumber ?? "",
  },

  // --- Vehicle Info ---
  {
    id: "name",
    label: "Vehicle Name",
    source: "Device",
    category: "Vehicle Info",
    get: (d) => d.name ?? "",
  },
  {
    id: "vin",
    label: "VIN",
    source: "Device",
    category: "Vehicle Info",
    get: (d) => d.vehicleIdentificationNumber ?? "",
  },
  {
    id: "licensePlate",
    label: "License Plate",
    source: "Device",
    category: "Vehicle Info",
    get: (d) => d.licensePlate ?? "",
  },
  {
    id: "licenseState",
    label: "License State",
    source: "Device",
    category: "Vehicle Info",
    get: (d) => d.licenseState ?? "",
  },
  {
    id: "comment",
    label: "Comments",
    source: "Device",
    category: "Vehicle Info",
    get: (d) => d.comment ?? "",
  },
  {
    id: "deviceType",
    label: "Device Type",
    source: "Device",
    category: "Vehicle Info",
    get: (d) => d.deviceType ?? "",
  },
  {
    id: "engineMakeModel",
    label: "Engine Make/Model",
    source: "Device",
    category: "Vehicle Info",
    get: (d) =>
      [d.engineVehicleIdentificationNumber, d.engineDescription].filter(Boolean).join(" "),
  },
  {
    id: "fuelType",
    label: "Fuel Type",
    source: "Device",
    category: "Vehicle Info",
    get: (d) => d.engineType ?? "",
  },
  {
    id: "timezone",
    label: "Timezone",
    source: "Device",
    category: "Vehicle Info",
    get: (d) => d.timeZoneId ?? "",
  },

  // --- Lifecycle ---
  {
    id: "activeFrom",
    label: "Active From",
    source: "Device",
    category: "Lifecycle",
    get: (d) => formatDate(d.activeFrom),
  },
  {
    id: "activeTo",
    label: "Active To",
    source: "Device",
    category: "Lifecycle",
    get: (d) => formatDate(d.activeTo),
  },

  // --- Groups ---
  {
    id: "groups",
    label: "Groups",
    source: "Device",
    category: "Groups",
    get: (d, ctx) => resolveGroupNames(d.groups, ctx.groupsById),
  },
  {
    id: "parentGroup",
    label: "Parent Group",
    source: "Device",
    category: "Groups",
    get: (d, ctx) => computeParentGroup(d as GeotabDevice, ctx.groupsById),
  },

  // --- Live Status (DeviceStatusInfo) ---
  {
    id: "lastReported",
    label: "Last Reported",
    source: "DeviceStatusInfo",
    category: "Live Status",
    get: (d, ctx) => {
      const i = dsi(d.id, ctx);
      return i?.dateTime ? formatDateTime(i.dateTime) : "";
    },
  },
  {
    id: "drivingState",
    label: "Driving State",
    source: "DeviceStatusInfo",
    category: "Live Status",
    get: (d, ctx) => {
      const i = dsi(d.id, ctx);
      if (!i) return "";
      if (!i.isDeviceCommunicating) return "Offline";
      return i.isDriving ? "Driving" : "Stopped";
    },
  },
  {
    id: "currentSpeedMph",
    label: "Current Speed (mph)",
    source: "DeviceStatusInfo",
    category: "Live Status",
    get: (d, ctx) => {
      const i = dsi(d.id, ctx);
      if (!i || typeof i.speed !== "number") return "";
      return (i.speed * 0.621371).toFixed(1);
    },
  },
  {
    id: "latitude",
    label: "Latitude",
    source: "DeviceStatusInfo",
    category: "Live Status",
    get: (d, ctx) => {
      const i = dsi(d.id, ctx);
      return i && typeof i.latitude === "number" ? i.latitude.toFixed(6) : "";
    },
  },
  {
    id: "longitude",
    label: "Longitude",
    source: "DeviceStatusInfo",
    category: "Live Status",
    get: (d, ctx) => {
      const i = dsi(d.id, ctx);
      return i && typeof i.longitude === "number" ? i.longitude.toFixed(6) : "";
    },
  },
  {
    id: "lastTripStart",
    label: "Last Trip Start",
    source: "DeviceStatusInfo",
    category: "Live Status",
    get: (d, ctx) => {
      const i = dsi(d.id, ctx);
      return i?.previousTripStart ? formatDateTime(i.previousTripStart) : "";
    },
  },
  {
    id: "lastTripEnd",
    label: "Last Trip End",
    source: "DeviceStatusInfo",
    category: "Live Status",
    get: (d, ctx) => {
      const i = dsi(d.id, ctx);
      return i?.previousTripEnd ? formatDateTime(i.previousTripEnd) : "";
    },
  },
  {
    id: "communicating",
    label: "Communicating",
    source: "DeviceStatusInfo",
    category: "Live Status",
    get: (d, ctx) => {
      const i = dsi(d.id, ctx);
      if (!i) return "";
      return i.isDeviceCommunicating ? "Yes" : "No";
    },
  },

  // --- Measurements (StatusData deltas, date-range required) ---
  {
    id: "odometerDelta",
    label: "Distance (mi)",
    source: "StatusData",
    category: "Measurements",
    diagnostic: "DiagnosticOdometerId",
    unitFactor: 0.000621371, // meters -> miles
    needsDateRange: true,
    get: (d, ctx) => {
      const rec = sd(d.id, ctx);
      if (!rec || typeof rec.odometerDelta !== "number") return "";
      return rec.odometerDelta.toFixed(1);
    },
  },
  {
    id: "engineHoursDelta",
    label: "Engine Hours",
    source: "StatusData",
    category: "Measurements",
    diagnostic: "DiagnosticEngineHoursId",
    unitFactor: 1 / 3600, // seconds -> hours
    needsDateRange: true,
    get: (d, ctx) => {
      const rec = sd(d.id, ctx);
      if (!rec || typeof rec.engineHoursDelta !== "number") return "";
      return rec.engineHoursDelta.toFixed(1);
    },
  },

  // --- Exception Rules ---
  {
    id: "totalExceptions",
    label: "Total Exceptions",
    source: "ExceptionEvent",
    category: "Exception Rules",
    needsDateRange: true,
    formatBucket: (v: number) => String(v),
    get: (d, ctx) => {
      const r = ee(d.id, ctx);
      return r && r.totalExceptions != null ? String(r.totalExceptions) : "0";
    },
  },
];

export function getRequiredFields(): FieldDefinition[] {
  return FIELD_REGISTRY.filter((f) => f.required);
}

export function getOptionalFields(): FieldDefinition[] {
  return FIELD_REGISTRY.filter((f) => !f.required);
}

export function lookupField(id: string): FieldDefinition | undefined {
  return FIELD_REGISTRY.find((f) => f.id === id);
}
