/**
 * Phase 2B.3 — drag-and-drop column picker.
 *
 * Replaces the checkbox-pill UI with two panels:
 *   • Left  ─ "Available fields" palette, grouped by category. Each
 *             field is a draggable card. Clicking + appends it to the
 *             selected list (keyboard / no-drag fallback).
 *   • Right ─ "Report columns" drop zone, an ordered list of the user's
 *             chosen fields. Cards reorder via drag (vertical sortable),
 *             and have an × button to remove. Required fields (Device ID
 *             and Geotab Serial) are always pinned at the top, locked.
 *
 * Selection is now ORDERED (string[]), not a Set — column order in the
 * final report comes straight from this array.
 *
 * Built on @dnd-kit/core + @dnd-kit/sortable. We model:
 *   - Palette cards: useDraggable (id = "palette:<fieldId>")
 *   - Selected cards: useSortable inside SortableContext (id = "<fieldId>")
 *   - Drop zone container: useDroppable (id = "zone:selected")
 * onDragEnd routes the three cases:
 *   1. palette → zone        → append
 *   2. selected → selected   → arrayMove
 *   3. selected → palette    → remove
 */

import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCenter,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { FieldDefinition } from "../types";

const COLORS = {
  navy: "#25477B",
  blue: "#0084C2",
  dark: "#1C2B39",
  light: "#F4F4F4",
  border: "#D8DEE5",
  zoneEmpty: "#F8FAFC",
  zoneOver: "#E5F1F8",
};

const PALETTE_PREFIX = "palette:";
const ZONE_ID = "zone:selected";

export interface DragDropFieldPickerProps {
  /** All non-required fields, available to drag in. */
  availableFields: FieldDefinition[];
  /** Required (always-on) fields shown locked at top of the selected list. */
  requiredFields: FieldDefinition[];
  /** Ordered list of currently selected field IDs. */
  selectedFieldIds: string[];
  /** Called with the new ordered list whenever it changes. */
  onChange: (next: string[]) => void;
  /** Category display order. Falls back to insertion order for unknown cats. */
  categoryOrder?: string[];
}

export function DragDropFieldPicker({
  availableFields,
  requiredFields,
  selectedFieldIds,
  onChange,
  categoryOrder = ["Vehicle Info", "Lifecycle", "Groups", "Live Status", "Measurements", "Custom Properties", "Exception Rules"],
}: DragDropFieldPickerProps) {
  // Lookup by id for fast resolution from selectedFieldIds back to definitions.
  const byId = useMemo(() => {
    const m = new Map<string, FieldDefinition>();
    for (const f of availableFields) m.set(f.id, f);
    for (const f of requiredFields) m.set(f.id, f);
    return m;
  }, [availableFields, requiredFields]);

  // Fields the palette should show = available - already selected.
  const selectedSet = useMemo(() => new Set(selectedFieldIds), [selectedFieldIds]);
  const remainingByCategory = useMemo(() => {
    const map = new Map<string, FieldDefinition[]>();
    for (const f of availableFields) {
      if (selectedSet.has(f.id)) continue;
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category)!.push(f);
    }
    // Sort alphabetically within each category for predictability.
    for (const [, arr] of map) arr.sort((a, b) => a.label.localeCompare(b.label));
    return map;
  }, [availableFields, selectedSet]);

  const orderedCats = useMemo(
    () => categoryOrder.filter((c) => remainingByCategory.has(c)),
    [categoryOrder, remainingByCategory]
  );

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function fieldFromActive(activeId: string): FieldDefinition | undefined {
    const id = activeId.startsWith(PALETTE_PREFIX) ? activeId.slice(PALETTE_PREFIX.length) : activeId;
    return byId.get(id);
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const active = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;

    // Case 1: palette → drop zone (or onto an existing selected card).
    if (active.startsWith(PALETTE_PREFIX)) {
      if (!overId) return;
      const fieldId = active.slice(PALETTE_PREFIX.length);
      if (selectedSet.has(fieldId)) return; // safety
      if (overId === ZONE_ID) {
        onChange([...selectedFieldIds, fieldId]);
        return;
      }
      // Dropped onto an existing selected card → insert at that index.
      const overIdx = selectedFieldIds.indexOf(overId);
      if (overIdx >= 0) {
        const next = [...selectedFieldIds];
        next.splice(overIdx, 0, fieldId);
        onChange(next);
      }
      return;
    }

    // Case 2 & 3: an already-selected card was dragged.
    if (!overId) {
      // Dropped outside any droppable — treat as remove.
      onChange(selectedFieldIds.filter((id) => id !== active));
      return;
    }
    if (overId === ZONE_ID || overId === active) return;
    // Reorder within selected list.
    if (selectedFieldIds.includes(overId)) {
      const oldIdx = selectedFieldIds.indexOf(active);
      const newIdx = selectedFieldIds.indexOf(overId);
      if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) {
        onChange(arrayMove(selectedFieldIds, oldIdx, newIdx));
      }
    }
  }

  function addField(fieldId: string) {
    if (selectedSet.has(fieldId)) return;
    onChange([...selectedFieldIds, fieldId]);
  }

  function removeField(fieldId: string) {
    onChange(selectedFieldIds.filter((id) => id !== fieldId));
  }

  const activeField = activeId ? fieldFromActive(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* LEFT: palette */}
        <div>
          <div style={{ fontSize: 11, color: "#6b7785", marginBottom: 8 }}>
            Drag a field into the panel on the right, or click <strong>+</strong> to add it.
          </div>
          {orderedCats.length === 0 ? (
            <div
              style={{
                padding: 16,
                fontSize: 12,
                color: "#6b7785",
                background: COLORS.zoneEmpty,
                border: `1px dashed ${COLORS.border}`,
                borderRadius: 6,
                textAlign: "center",
              }}
            >
              All fields are selected.
            </div>
          ) : (
            orderedCats.map((cat) => (
              <details
                key={cat}
                open={cat !== "Exception Rules"}
                style={{ marginBottom: 8 }}
              >
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
                    ({remainingByCategory.get(cat)!.length})
                  </span>
                </summary>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    padding: "8px 0 0 0",
                  }}
                >
                  {remainingByCategory.get(cat)!.map((f) => (
                    <PaletteCard key={f.id} field={f} onAdd={() => addField(f.id)} />
                  ))}
                </div>
              </details>
            ))
          )}
        </div>

        {/* RIGHT: drop zone with sortable selected list */}
        <SelectedZone
          requiredFields={requiredFields}
          selectedFieldIds={selectedFieldIds}
          byId={byId}
          onRemove={removeField}
        />
      </div>

      {/* Floating preview of the card being dragged */}
      <DragOverlay>
        {activeField ? (
          <CardSurface
            label={activeField.label}
            needsDateRange={activeField.needsDateRange}
            isOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/* ─────────── Palette card (draggable, click to add) ─────────── */

function PaletteCard({ field, onAdd }: { field: FieldDefinition; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: PALETTE_PREFIX + field.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 6,
        background: "#FFFFFF",
        opacity: isDragging ? 0.4 : 1,
        cursor: "grab",
        fontSize: 12,
        color: COLORS.dark,
      }}
      {...attributes}
      {...listeners}
    >
      <span aria-hidden style={{ color: "#97a3b0", fontSize: 14, lineHeight: 1 }}>⋮⋮</span>
      <span style={{ flex: 1 }}>{field.label}</span>
      {field.needsDateRange && (
        <span style={{ color: "#2E7D32", fontSize: 9 }}>· date</span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAdd();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        title={`Add ${field.label}`}
        style={{
          border: `1px solid ${COLORS.blue}`,
          color: COLORS.blue,
          background: "#FFFFFF",
          borderRadius: 4,
          width: 22,
          height: 22,
          lineHeight: "20px",
          padding: 0,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        +
      </button>
    </div>
  );
}

/* ─────────── Drop zone (right panel) ─────────── */

function SelectedZone({
  requiredFields,
  selectedFieldIds,
  byId,
  onRemove,
}: {
  requiredFields: FieldDefinition[];
  selectedFieldIds: string[];
  byId: Map<string, FieldDefinition>;
  onRemove: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: ZONE_ID });
  const showEmpty = selectedFieldIds.length === 0;

  return (
    <div>
      <div
        style={{
          fontWeight: 700,
          color: COLORS.navy,
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginBottom: 8,
        }}
      >
        Report columns{" "}
        <span style={{ color: "#6b7785", fontWeight: 400 }}>
          ({requiredFields.length + selectedFieldIds.length})
        </span>
      </div>

      {/* Pinned required cards (not draggable) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
        {requiredFields.map((f) => (
          <CardSurface key={f.id} label={f.label} locked />
        ))}
      </div>

      {/* Sortable user-chosen cards */}
      <div
        ref={setNodeRef}
        style={{
          minHeight: 80,
          padding: 8,
          background: isOver ? COLORS.zoneOver : COLORS.zoneEmpty,
          border: `1px dashed ${isOver ? COLORS.blue : COLORS.border}`,
          borderRadius: 6,
          transition: "background 100ms, border-color 100ms",
        }}
      >
        {showEmpty ? (
          <div
            style={{
              fontSize: 12,
              color: "#6b7785",
              textAlign: "center",
              padding: "12px 0",
              fontStyle: "italic",
            }}
          >
            Drop fields here, or click the <strong>+</strong> on a field card.
          </div>
        ) : (
          <SortableContext items={selectedFieldIds} strategy={verticalListSortingStrategy}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {selectedFieldIds.map((id) => {
                const f = byId.get(id);
                if (!f) return null;
                return (
                  <SortableSelectedCard
                    key={id}
                    field={f}
                    onRemove={() => onRemove(id)}
                  />
                );
              })}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  );
}

/* ─────────── Sortable card inside the drop zone ─────────── */

function SortableSelectedCard({
  field,
  onRemove,
}: {
  field: FieldDefinition;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <CardSurface
        label={field.label}
        needsDateRange={field.needsDateRange}
        onRemove={onRemove}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

/* ─────────── Pure visual card (shared by palette, drop zone, overlay) ─────────── */

function CardSurface({
  label,
  needsDateRange,
  locked,
  isOverlay,
  onRemove,
  dragHandleProps,
}: {
  label: string;
  needsDateRange?: boolean;
  locked?: boolean;
  isOverlay?: boolean;
  onRemove?: () => void;
  dragHandleProps?: Record<string, unknown>;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        border: `1px solid ${locked ? COLORS.border : COLORS.blue}`,
        borderRadius: 6,
        background: locked ? "#F4F4F4" : "#E5F1F8",
        fontSize: 12,
        color: locked ? "#6b7785" : COLORS.navy,
        fontWeight: locked ? 400 : 600,
        boxShadow: isOverlay ? "0 4px 12px rgba(0,0,0,0.18)" : "none",
        cursor: locked ? "default" : isOverlay ? "grabbing" : "default",
      }}
    >
      {locked ? (
        <span aria-hidden style={{ color: "#97a3b0", fontSize: 12 }}>🔒</span>
      ) : (
        <span
          aria-hidden
          style={{ color: "#97a3b0", fontSize: 14, lineHeight: 1, cursor: "grab" }}
          {...(dragHandleProps ?? {})}
        >
          ⋮⋮
        </span>
      )}
      <span style={{ flex: 1 }}>{label}</span>
      {needsDateRange && <span style={{ color: "#2E7D32", fontSize: 9 }}>· date</span>}
      {locked && <span style={{ fontSize: 9, color: "#97a3b0" }}>required</span>}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          onPointerDown={(e) => e.stopPropagation()}
          title={`Remove ${label}`}
          style={{
            border: "1px solid #C8D0DA",
            color: "#6b7785",
            background: "#FFFFFF",
            borderRadius: 4,
            width: 22,
            height: 22,
            lineHeight: "20px",
            padding: 0,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
