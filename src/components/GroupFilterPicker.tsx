/**
 * Native-style group picker built on Zenith's GroupsFilter.
 *
 * Wraps the IGroupsFilterTotalState (which supports multi-select, hierarchy,
 * AND/OR advanced filtering) into the simpler "give me the selected group
 * IDs as an array" API our buildReport already expects.
 *
 *   <GroupFilterPicker groupsById={...} onChange={ids => ...} />
 *
 * dataLoader resolves with the IGroupItem tree built from the cached
 * groupsById we already loaded in App.tsx — no second API round-trip.
 */

import { useCallback, useMemo, useState } from "react";
import {
  GroupsFilter,
  RelationOperator,
  type IGroupItem,
  type IGroupsFilterTotalState,
  type IFilterState,
} from "@geotab/zenith";
import type { GeotabGroup } from "../types";

export interface GroupFilterPickerProps {
  /** Groups already fetched by App.tsx, keyed by id. */
  groupsById: Map<string, GeotabGroup>;
  /** Initial selection (defaults to Company group when omitted). */
  initialGroupIds?: string[];
  /** Called whenever the selection changes. */
  onChange: (groupIds: string[]) => void;
  /** Called when GroupsFilter surfaces an error. */
  onError?: (e: Error) => void;
}

/**
 * Build the IGroupItem[] FLAT array Zenith's GroupsFilter expects.
 *
 * Per Zenith's test data shape, this is a single flat list where each item
 * with descendants has a `children` array of just `{id}` references to OTHER
 * items in the same array — NOT nested IGroupItem objects. The raw Geotab
 * API response is already exactly this shape; we just normalize names and
 * sort Company group first.
 */
function buildGroupItemArr(byId: Map<string, GeotabGroup>): IGroupItem[] {
  const items: IGroupItem[] = [];
  byId.forEach((g) => {
    items.push({
      id: g.id,
      name: g.name && g.name.length > 0 ? g.name : g.id,
      children: Array.isArray(g.children) && g.children.length > 0
        ? g.children.map((c) => ({ id: c.id }))
        : undefined,
    });
  });
  items.sort((a, b) => {
    if (a.id === "GroupCompanyId") return -1;
    if (b.id === "GroupCompanyId") return 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
  return items;
}

/** Walk an IFilterState recursively and pull out all leaf group IDs. */
function flattenIds(state: IFilterState | undefined): string[] {
  if (!state || !Array.isArray(state.items)) return [];
  const out: string[] = [];
  for (const item of state.items) {
    if (item && typeof item === "object" && "items" in item && Array.isArray((item as IFilterState).items)) {
      out.push(...flattenIds(item as IFilterState));
    } else if (item && typeof item === "object" && "id" in item && typeof (item as { id: string }).id === "string") {
      out.push((item as { id: string }).id);
    }
  }
  return out;
}

export function GroupFilterPicker({
  groupsById,
  initialGroupIds,
  onChange,
  onError,
}: GroupFilterPickerProps) {
  const [state, setState] = useState<IGroupsFilterTotalState>(() => {
    const ids = initialGroupIds && initialGroupIds.length > 0 ? initialGroupIds : ["GroupCompanyId"];
    return {
      groups: {
        relation: RelationOperator.OR,
        items: ids.map((id) => ({ id })),
      },
      sideWide: false,
    };
  });

  const dataLoader = useCallback(async (): Promise<IGroupItem[]> => {
    const items = buildGroupItemArr(groupsById);
    console.log("[ARB] GroupsFilter dataLoader returning", items.length, "items, sample:", items.slice(0, 3));
    return items;
  }, [groupsById]);

  const handleChange = useCallback(
    (next: IGroupsFilterTotalState) => {
      setState(next);
      onChange(flattenIds(next.groups));
    },
    [onChange]
  );

  const errorHandler = useCallback(
    (e: Error) => {
      console.error("[ARB] GroupsFilter error:", e);
      onError?.(e);
    },
    [onError]
  );

  // Memoize the initialFilterState reference — recreating it every render
  // would force GroupsFilter to think the user-controlled state changed.
  const initialFilterState = useMemo(() => state, []);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GroupsFilter
      dataLoader={dataLoader}
      onChange={handleChange}
      errorHandler={errorHandler}
      initialFilterState={initialFilterState}
    />
  );
}
