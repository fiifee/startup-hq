"use client";

import { useEffect, useId, useState } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";

type Column = { id: string; label: string; hint?: string };

function Droppable({ column, count, children, compact }: { column: Column; count: number; children: React.ReactNode; compact?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section
      ref={setNodeRef}
      aria-label={column.label}
      className={`flex flex-col rounded-lg border bg-sunken/60 min-w-[260px] md:min-w-0 ${compact ? "" : "min-h-[200px]"} transition-colors ${
        isOver ? "border-accent bg-accent-soft/60" : "border-line"
      }`}
    >
      <h2 className="px-3 pt-3 pb-2 text-sm font-semibold flex items-center gap-2">
        {column.label} <span className="ref font-normal">{count}</span>
      </h2>
      {column.hint && <p className="px-3 -mt-1 pb-2 text-xs text-ink-3">{column.hint}</p>}
      <div className="flex flex-col gap-2 px-2 pb-2 flex-1">{children}</div>
    </section>
  );
}

function Draggable({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={`touch-manipulation cursor-grab active:cursor-grabbing outline-none rounded-md focus-visible:ring-2 focus-visible:ring-accent ${isDragging ? "opacity-30" : ""}`}>
      {children}
    </div>
  );
}

/**
 * Columns you drag cards between, with mouse, touch (press and hold) or keyboard
 * (focus a card, Space, arrows, Space). Moves are shown at once and rolled back
 * if the server refuses.
 */
export function DndColumns<T extends { id: string }>({
  columns,
  items,
  columnOf,
  onMove,
  renderCard,
  empty = "Drop here",
}: {
  columns: Column[];
  items: T[];
  columnOf: (item: T) => string;
  onMove: (item: T, column: string) => Promise<boolean>;
  renderCard: (item: T) => React.ReactNode;
  empty?: string;
}) {
  // A stable id keeps dnd-kit's accessibility ids the same on server and client.
  const dndId = useId();
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null);
  // Fresh server data supersedes local moves.
  useEffect(() => setOverrides({}), [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const col = (item: T) => overrides[item.id] ?? columnOf(item);

  async function onDragEnd(e: DragEndEvent) {
    setActive(null);
    const item = items.find((i) => i.id === e.active.id);
    const to = e.over?.id ? String(e.over.id) : null;
    if (!item || !to || to === col(item)) return;
    setOverrides((o) => ({ ...o, [item.id]: to }));
    const ok = await onMove(item, to);
    if (!ok) setOverrides((o) => {
      const { [item.id]: _drop, ...rest } = o;
      void _drop;
      return rest;
    });
  }

  const activeItem = items.find((i) => i.id === active);
  return (
    <DndContext id={dndId} sensors={sensors} onDragStart={(e: DragStartEvent) => setActive(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className="flex md:grid gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((c) => {
          const inCol = items.filter((i) => col(i) === c.id);
          return (
            <Droppable key={c.id} column={c} count={inCol.length}>
              {inCol.map((i) => <Draggable key={i.id} id={i.id}>{renderCard(i)}</Draggable>)}
              {inCol.length === 0 && <p className="text-xs text-ink-3 text-center py-6 border border-dashed border-line-strong rounded-md">{empty}</p>}
            </Droppable>
          );
        })}
      </div>
      {/* Lifted while carried; settles into its column with the app's ease-out. */}
      <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }}>
        {activeItem ? (
          <div className="rotate-[1.5deg] scale-[1.02] rounded-md shadow-[0_2px_4px_rgb(0_0_0/0.06),0_12px_28px_-6px_rgb(0_0_0/0.22)] cursor-grabbing">{renderCard(activeItem)}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
