"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { requireSupabase } from "@/lib/supabase";
import { QuickScheduleModal } from "@/components/QuickScheduleModal";

type ContentItem = {
  id: string;
  title: string;
  type: string;
  content_status: string;
  metadata: {
    publish_at?: string | null;
    expire_at?: string | null;
    [key: string]: unknown;
  };
};

const categoryCubes: Record<string, { label: string; color: string; bg: string }> = {
  daily_prayer:     { label: "DP", color: "#FFFFFF", bg: "#2563EB" }, // Royal Blue
  daily_inspiration: { label: "DI", color: "#FFFFFF", bg: "#D97706" }, // Golden Amber/Yellow
  church_highlight: { label: "CH", color: "#FFFFFF", bg: "#EA580C" }, // Vibrant Orange
  bible_reading:   { label: "BR", color: "#FFFFFF", bg: "#7C3AED" }, // Royal Purple (Scripture)
  saint_of_the_day: { label: "SD", color: "#FFFFFF", bg: "#0D9488" }, // Deep Teal
  catholic_news:    { label: "CN", color: "#FFFFFF", bg: "#EF4444" }, // Vibrant Red
  update:           { label: "UP", color: "#FFFFFF", bg: "#16A34A" }, // Emerald Green
  faith_story:      { label: "FS", color: "#FFFFFF", bg: "#E11D48" }, // Vivid Rose/Pink
};

const categoryOrder = [
  "daily_prayer",
  "daily_inspiration",
  "bible_reading",
  "church_highlight",
  "faith_story",
  "update",
  "saint_of_the_day",
  "catholic_news",
];

function getCategoryOrder(type: string) {
  const index = categoryOrder.indexOf(type);
  return index === -1 ? categoryOrder.length : index;
}


type ScheduleLane = {
  type: string;
  index: number;
  items: ContentItem[];
};

type DaySegment = {
  item: ContentItem;
  startsToday: boolean;
  endsToday: boolean;
};

function isItemExpired(item: ContentItem): boolean {
  if (!item.metadata.expire_at) return false;
  const expDate = new Date(item.metadata.expire_at);
  return !isNaN(expDate.getTime()) && expDate <= new Date();
}

function scheduleStart(item: ContentItem) {
  return new Date(item.metadata.publish_at || 0);
}

function scheduleEnd(item: ContentItem) {
  const start = scheduleStart(item);
  return item.metadata.expire_at ? new Date(item.metadata.expire_at) : new Date(start.getTime() + 60_000);
}

function buildScheduleLanes(items: ContentItem[], year: number, month: number) {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);
  const byType = new Map<string, ContentItem[]>();

  items.forEach((item) => {
    if (isItemExpired(item)) return;
    if (!item.metadata.publish_at || scheduleStart(item) >= monthEnd || scheduleEnd(item) <= monthStart) return;
    const group = byType.get(item.type) ?? [];
    group.push(item);
    byType.set(item.type, group);
  });

  return [...byType.entries()]
    .sort(([typeA], [typeB]) => getCategoryOrder(typeA) - getCategoryOrder(typeB) || typeA.localeCompare(typeB))
    .flatMap(([type, typeItems]) => {
      const lanes: ContentItem[][] = [];
      typeItems
        .sort((a, b) => scheduleStart(a).getTime() - scheduleStart(b).getTime() || a.id.localeCompare(b.id))
        .forEach((item) => {
          const reusableLane = lanes.findIndex((lane) => scheduleEnd(lane[lane.length - 1]) <= scheduleStart(item));
          if (reusableLane === -1) lanes.push([item]);
          else lanes[reusableLane].push(item);
        });
      return lanes.map((laneItems, index): ScheduleLane => ({ type, index, items: laneItems }));
    });
}

function getDaySegments(lane: ScheduleLane, year: number, month: number, day: number): DaySegment[] {
  const dayStart = new Date(year, month, day);
  const nextDayStart = new Date(year, month, day + 1);
  return lane.items
    .filter((item) => scheduleStart(item) < nextDayStart && scheduleEnd(item) > dayStart)
    .map((item) => ({
      item,
      startsToday: scheduleStart(item) >= dayStart,
      endsToday: scheduleEnd(item) < nextDayStart,
    }));
}

export default function EditorialCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [items, setItems] = useState<ContentItem[]>([]);
  const [, setLoading] = useState(true);
  const [, setError] = useState("");
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);

  const loadMonthData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const client = requireSupabase();

      const { data, error: loadError } = await client
        .from("content_items")
        .select("id, title, type, content_status, metadata")
        .eq("content_status", "ready");

      if (loadError) throw loadError;

      setItems((data ?? []) as ContentItem[]);
    } catch {
      setError("Could not load editorial schedule.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      await loadMonthData();
    };
    void load();
  }, [loadMonthData]);

  const handleQuickSave = async (id: string, publishAt: string, expireAt: string) => {
    try {
      const client = requireSupabase();

      // 1. Get current item to preserve other metadata
      const currentItem = items.find(i => i.id === id);
      if (!currentItem) throw new Error("Item not found locally.");

      const updatedMetadata = {
        ...currentItem.metadata,
        publish_at: publishAt || null,
        expire_at: expireAt || null
      };

      // 2. Update Supabase
      const { error: updateError } = await client
        .from("content_items")
        .update({ metadata: updatedMetadata })
        .eq("id", id);

      if (updateError) throw updateError;

      // 3. Update local state
      setItems(prev => prev.map(item =>
        item.id === id ? { ...item, metadata: updatedMetadata } : item
      ));
    } catch (err) {
      console.error("Quick save error:", err);
      throw err;
    }
  };

  const changeMonth = (offset: number) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1));
  };

  // Calendar Math
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = currentDate.toLocaleString("default", { month: "long", year: "numeric" });
  const today = new Date();

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const padding = Array.from({ length: firstDayOfMonth }, () => null);
  const calendarCells = [...padding, ...days];
  const scheduleLanes = buildScheduleLanes(items, year, month);

  return (
    <AdminGate>
      <main className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Editorial operations</p>
            <h1 className="title">Editorial Calendar</h1>
            <p className="description">
              Spot content gaps and manage your publishing rhythm across the month.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex border border-line rounded-xl overflow-hidden bg-white">
               <button onClick={() => changeMonth(-1)} className="px-4 py-2 hover:bg-beige transition-colors border-r border-line">&larr;</button>
               <div className="px-6 py-2 font-bold text-ink min-w-48 text-center">{monthLabel}</div>
               <button onClick={() => changeMonth(1)} className="px-4 py-2 hover:bg-beige transition-colors border-l border-line">&rarr;</button>
            </div>
            <button className="button secondary" onClick={() => void loadMonthData()}>Refresh</button>
          </div>
        </div>

        <div className="calendar-grid-wrapper mt-8">
          <div className="grid grid-cols-7 gap-px bg-line border border-line rounded-2xl shadow-sm">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, index) => (
              <div key={d} className={`calendar-weekday bg-paper p-3 text-center text-xs font-bold uppercase tracking-widest text-muted border-b border-line ${index === 0 ? "rounded-tl-2xl" : ""} ${index === 6 ? "rounded-tr-2xl" : ""}`}>
                {d}
              </div>
            ))}

            {calendarCells.map((day, idx) => {
              const activeItems = day
                ? scheduleLanes.flatMap((lane) => getDaySegments(lane, year, month, day).map((segment) => segment.item))
                : [];
              const isToday = Boolean(day) && today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

              return (
                <div key={idx} className={`bg-white min-h-32 p-2 flex flex-col gap-2 ${!day ? "bg-beige/20" : ""}`}>
                  {day && (
                    <>
                      <div className="flex justify-between items-start">
                        <span
                          aria-label={isToday ? `Today, ${monthLabel.split(" ")[0]} ${day}` : undefined}
                          className={`text-sm font-bold w-7 h-7 -mt-1 -ml-1 flex items-center justify-center rounded-full ${
                            isToday ? "bg-blue-600 text-white ring-4 ring-blue-100" : activeItems.length === 0 ? "text-muted" : "text-ink"
                          }`}
                        >
                          {day}
                        </span>
                        {activeItems.length === 0 && (
                          <span className="text-[10px] font-bold text-danger/60 px-1.5 py-0.5 bg-danger/5 rounded border border-danger/10">GAP</span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 mt-1">
                        {scheduleLanes.map((lane, laneIndex) => {
                          const segments = getDaySegments(lane, year, month, day);
                          const startsCategory = laneIndex > 0 && scheduleLanes[laneIndex - 1].type !== lane.type;
                          const categorySpacing = startsCategory ? "mt-2" : "";
                          if (segments.length === 0) return <div key={`${lane.type}-${lane.index}`} className={`h-7 ${categorySpacing}`} aria-hidden="true" />;

                          return (
                            <div key={`${lane.type}-${lane.index}`} className={`flex h-7 min-w-0 ${categorySpacing}`}>
                              {segments.map(({ item, startsToday, endsToday }) => {
                                const cube = categoryCubes[item.type] || { label: "??", color: "#FFFFFF", bg: "#4B5563" };
                                const scheduleColor = cube.bg;
                                const weekday = new Date(year, month, day).getDay();
                                const beginsSegment = startsToday || weekday === 0 || day === 1;
                                const endsSegment = endsToday || weekday === 6 || day === daysInMonth;
                                const leftExtension = beginsSegment ? "ml-0" : "-ml-2 pl-2";
                                const rightExtension = endsSegment ? "mr-0" : "-mr-2 pr-2";
                                const rounding = beginsSegment && endsSegment
                                  ? "rounded-md"
                                  : beginsSegment
                                    ? "rounded-l-md rounded-r-none"
                                    : endsSegment
                                      ? "rounded-r-md rounded-l-none"
                                      : "rounded-none";
                                return (
                                  <button
                                    key={item.id}
                                    onClick={() => setSelectedItem(item)}
                                    className={`relative z-10 min-w-0 flex-1 px-2 flex items-center gap-1 overflow-hidden text-[9px] font-bold text-left text-white shadow-sm hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-blue-200 ${endsToday && !startsToday ? "ring-2 ring-inset ring-white/60" : ""} ${leftExtension} ${rightExtension} ${rounding}`}
                                    style={{ backgroundColor: scheduleColor }}
                                    title={item.title}
                                  >
                                    {startsToday ? (
                                      <><span className="shrink-0">{cube.label}</span><span className="truncate font-semibold">{item.title}</span></>
                                    ) : endsToday ? (
                                      <span className="w-full truncate tracking-wide font-black">END</span>
                                    ) : (
                                      <span className="w-full truncate tracking-wide opacity-90">==============</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {selectedItem && (
          <QuickScheduleModal
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onSave={handleQuickSave}
          />
        )}
      </main>
    </AdminGate>
  );
}
