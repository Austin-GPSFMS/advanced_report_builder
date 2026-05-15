/**
 * Group helpers.
 *
 * `computeParentGroup` is used both at row-build time (for the `parentGroup`
 * field) and again during Per Group aggregation (to bucket vehicles by their
 * first non-Company ancestor group).
 */

import type { GeotabDevice, GeotabGroup } from "../types";

/**
 * Return the first non-Company group name from the device's group list, or
 * the first group's name if all of them are Company, or "(no group)" if
 * none. Mirrors the vanilla build's logic exactly so reports come out the
 * same.
 */
export function computeParentGroup(
  device: GeotabDevice,
  groupsById: Map<string, GeotabGroup>
): string {
  if (!Array.isArray(device.groups) || device.groups.length === 0) return "(no group)";
  for (const ref of device.groups) {
    if (ref.id === "GroupCompanyId") continue;
    const full = groupsById.get(ref.id);
    if (full?.name) return full.name;
  }
  const first = groupsById.get(device.groups[0].id);
  return first?.name ?? "(no group)";
}

/** Resolve an array of group references to a comma-separated list of names. */
export function resolveGroupNames(
  refs: Array<{ id: string }> | undefined,
  groupsById: Map<string, GeotabGroup>
): string {
  if (!Array.isArray(refs)) return "";
  return refs
    .map((g) => groupsById.get(g.id)?.name ?? g.id)
    .filter(Boolean)
    .join(", ");
}
