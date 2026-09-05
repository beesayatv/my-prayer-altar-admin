import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  getTargetDates,
  formatLocalTimeToUtcIso,
  validateGeneratedContent,
  processDailyPrayerQueue,
} from "./queueProcessor";

// Helper mock factory for Supabase Client
function createMockSupabaseClient(configOverride: Record<string, unknown> = {}, existingItems: Record<string, unknown>[] = []) {
  return {
    from: (table: string) => {
      if (table === "automation_configs") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  content_type: "daily_prayer",
                  is_enabled: true,
                  operating_mode: "generate_and_schedule",
                  queue_length_days: 3,
                  publication_time: "00:00",
                  generation_time: "02:00",
                  time_zone: "Asia/Manila",
                  language_code: "en",
                  preferred_length: "standard",
                  generation_quality: "balanced",
                  theme_strategy: "rotation_enabled",
                  ...configOverride,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "content_items") {
        return {
          select: () => ({
            eq: async () => ({
              data: existingItems,
              error: null,
            }),
          }),
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: { id: "test-item-id-123" },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    },
  } as unknown as Parameters<typeof processDailyPrayerQueue>[1];
}

describe("Daily Prayer Queue Processor Unit Tests", () => {
  // Test 1: IANA Timezone Conversions (Asia/Manila 00:00 -> 2026-08-07T16:00:00.000Z)
  test("1. Converts 2026-08-08 00:00 Asia/Manila to 2026-08-07T16:00:00.000Z", () => {
    const iso = formatLocalTimeToUtcIso("2026-08-08", "00:00", "Asia/Manila");
    assert.equal(iso, "2026-08-07T16:00:00.000Z");
  });

  // Test 2: IANA Timezone Conversions (Asia/Manila 05:00 -> 2026-08-07T21:00:00.000Z)
  test("2. Converts 2026-08-08 05:00 Asia/Manila to 2026-08-07T21:00:00.000Z", () => {
    const iso = formatLocalTimeToUtcIso("2026-08-08", "05:00", "Asia/Manila");
    assert.equal(iso, "2026-08-07T21:00:00.000Z");
  });

  // Test 3: UTC Timezone Unchanged
  test("3. UTC timezone remains unchanged (2026-08-08 00:00 UTC -> 2026-08-08T00:00:00.000Z)", () => {
    const iso = formatLocalTimeToUtcIso("2026-08-08", "00:00", "UTC");
    assert.equal(iso, "2026-08-08T00:00:00.000Z");
  });

  // Test 4: Another Timezone Conversion (America/New_York EDT UTC-4)
  test("4. Converts 2026-08-08 00:00 America/New_York (EDT) to 2026-08-08T04:00:00.000Z", () => {
    const iso = formatLocalTimeToUtcIso("2026-08-08", "00:00", "America/New_York");
    assert.equal(iso, "2026-08-08T04:00:00.000Z");
  });

  // Test 5: OFF Mode Behavior
  test("5. Returns 'off' status when automation is disabled or mode is 'off'", async () => {
    const mockClient = createMockSupabaseClient({ is_enabled: false, operating_mode: "off" });
    const res = await processDailyPrayerQueue("user-123", mockClient);

    assert.equal(res.status, "off");
    assert.match(res.message, /turned off/);
    assert.equal(res.generated_count, 0);
  });

  // Test 6: Existing Date Skipped
  test("6. Skips target date if daily_prayer already exists for that scheduled_date", async () => {
    const targetDates = getTargetDates(3, "Asia/Manila");
    const mockExisting = [
      {
        id: "item-1",
        title: "Existing Prayer",
        type: "daily_prayer",
        metadata: { scheduled_date: targetDates[0] },
      },
    ];

    const mockClient = createMockSupabaseClient({ is_enabled: true, operating_mode: "drafts_only" }, mockExisting);
    const res = await processDailyPrayerQueue("user-123", mockClient);

    const skippedForDate0 = res.skipped_dates.find((s) => s.date === targetDates[0]);
    assert.ok(skippedForDate0);
    assert.match(skippedForDate0?.reason ?? "", /already exists/);
  });

  // Test 7: Validation Rejects Missing Required Fields
  test("7. Validation fails if required fields are missing", () => {
    const draft = { title: "", intention: "Peace", excerpt: "Excerpt", body: "Body text..." };
    const check = validateGeneratedContent(draft, "standard", []);
    assert.equal(check.valid, false);
    assert.match(check.reason ?? "", /Title is missing/);
  });

  // Test 8: Validation Rejects Code Artifacts
  test("8. Validation fails if content contains raw code block artifacts", () => {
    const draft = {
      title: "Prayer Title",
      intention: "Peace",
      excerpt: "Excerpt",
      body: "```json\nO Lord grant peace...\n```",
    };
    const check = validateGeneratedContent(draft, "standard", []);
    assert.equal(check.valid, false);
    assert.match(check.reason ?? "", /code block artifacts/);
  });

  // Test 9: Validation Rejects Duplicate Titles
  test("9. Validation fails if title duplicates a recent prayer", () => {
    const draft = {
      title: "Prayer for Daily Strength",
      intention: "Strength",
      excerpt: "Excerpt text",
      body: "Heavenly Father, grant us daily strength to navigate our trials and remain steadfast in faith. We place our hope in Your loving mercy and seek Your divine guidance through every moment of this day. May Your Holy Spirit illuminate our decisions, comfort our hearts in moments of doubt, and strengthen our resolve to serve others with compassion and humility. Amen.",
    };
    const check = validateGeneratedContent(draft, "standard", ["prayer for daily strength"]);
    assert.equal(check.valid, false);
    assert.match(check.reason ?? "", /duplicates a recent prayer/);
  });

  // Test 10: Validation Succeeds for Compliant Content
  test("10. Validation succeeds for valid draft within word count bounds", () => {
    const draft = {
      title: "A Prayer for Grace and Guidance",
      intention: "Grace and Guidance",
      excerpt: "Lord, fill our hearts with your holy grace today.",
      body: "Heavenly Father, we humbly present our day to you. Grant us your peace, illuminate our path, and strengthen our faith through all circumstances. Guide our words and actions so that we may bring glory to Your holy name in all that we do. Lord Jesus, shepherd our souls and fill us with Your divine grace and love. Amen.",
    };
    const check = validateGeneratedContent(draft, "standard", []);
    assert.equal(check.valid, true);
  });

  // Test 11: Locked Item Preservation Rule
  test("11. Existing locked items in Supabase are preserved and skipped", async () => {
    const targetDates = getTargetDates(3, "Asia/Manila");
    const mockExistingLocked = [
      {
        id: "locked-item-1",
        title: "Human Edited Prayer",
        type: "daily_prayer",
        metadata: { scheduled_date: targetDates[0], is_locked: "true", creation_mode: "human_edited" },
      },
    ];

    const mockClient = createMockSupabaseClient({ is_enabled: true, operating_mode: "generate_and_schedule" }, mockExistingLocked);
    const res = await processDailyPrayerQueue("user-123", mockClient);

    assert.ok(res.skipped_dates.some((s) => s.date === targetDates[0]));
  });
});
