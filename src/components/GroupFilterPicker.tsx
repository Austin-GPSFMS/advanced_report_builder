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

/** Build the IGroupItem tree (children nested) from a flat Group map. */
function buildGroupItemTree(byId: Map<string, GeotabGroup>): IGroupItem[] {
  // Roots = groups that don't appear as anyone's child.
  const childIds = new Set<string>();
  byId.forEach((g) => {
    g.children?.forEach((c) => childIds.add(c.id));
  });

  const seen = new Set<string>();
  const toItem = (g: GeotabGroup): IGroupItem => {
    if (seen.has(g.id)) return { id: g.id, name: g.name };
    seen.add(g.id);
    const kids: IGroupItem[] = [];
    if (Array.isArray(g.children)) {
      for (const ref of g.children) {
        const full = byId.get(ref.id);
        if (full) kids.push(toItem(full));
      }
    }
    return kids.length > 0 ? { id: g.id, name: g.name, children: kids } : { id: g.id, name: g.name };
  };

  const roots: IGroupItem[] = [];
  byId.forEach((g) => {
    if (!childIds.has(g.id)) roots.push(toItem(g));
  });

  // Company group first, then alphabetical.
  roots.sort((a, b) => {
    if (a.id === "GroupCompanyId") return -1;
    if (b.id === "GroupCompanyId") return 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
  return roots;
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
    return buildGroupItemTree(groupsById);
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
