export const DEVOTION_SECTION_KEYS = ["prayers", "articles", "places", "videos"] as const;
export const DEVOTION_ITEM_TYPES = ["prayer", "article", "place", "video"] as const;
export type DevotionSectionKey = typeof DEVOTION_SECTION_KEYS[number];
export type DevotionItemType = typeof DEVOTION_ITEM_TYPES[number];
export type DevotionStatus = "draft" | "ready" | "archived";
export type DevotionItemStatus = "draft" | "published" | "archived";
export type Devotion = { id: string; slug: string; language_code: string; title: string; short_description: string; description: string | null; cover_image_path: string | null; status: DevotionStatus; sort_order: number };
export type DevotionSection = { id: string; devotion_id: string; section_key: DevotionSectionKey; display_label: string; sort_order: number; is_visible: boolean };
export type DevotionItem = { id: string; devotion_id: string; section_id: string; content_type: DevotionItemType; status: DevotionItemStatus; language_code: string; slug: string; title: string; summary: string | null; body: string | null; cover_image_path: string | null; location_name: string | null; address: string | null; map_url: string | null; video_url: string | null; source_name: string | null; source_url: string | null; metadata: Record<string, unknown>; sort_order: number };
export const DEFAULT_SECTION_LABELS: Record<DevotionSectionKey, string> = { prayers: "Prayers", articles: "History and reflections", places: "Churches and pilgrimage places", videos: "Videos" };
export const ITEM_TYPE_LABELS: Record<DevotionItemType, string> = { prayer: "Prayer", article: "Article", place: "Place", video: "Video" };
export function defaultSectionKey(type: DevotionItemType): DevotionSectionKey { if (type === "prayer") return "prayers"; if (type === "place") return "places"; if (type === "video") return "videos"; return "articles"; }
export function slugify(value: string): string { return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
export function devotionImageUrl(path: string | null | undefined): string { if (!path) return ""; if (/^https?:\/\//i.test(path)) return path; return `https://myprayeraltar-videos-sg.b-cdn.net/${path.replace(/^\/+/, "")}`; }
