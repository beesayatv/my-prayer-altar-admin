"use client";

import { useState } from "react";
import { AdminGate } from "@/components/AdminGate";

const ALL_VOICES = [
  "alloy",
  "ash",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
];

const LEGACY_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

export default function VoiceEvaluationPage() {
  const [activeTab, setActiveTab] = useState<"current" | "legacy-hd" | "legacy-std">("current");
  const [selectedStyle, setSelectedStyle] = useState<"gentle" | "solemn">("gentle");

  return (
    <AdminGate>
      <main className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Internal Evaluation Only</p>
            <h1 className="title">🎙️ OpenAI Voice & Model Evaluation</h1>
            <p className="description">
              Evaluate official OpenAI Text-to-Speech model (<code>gpt-4o-mini-tts</code>) using direct <code>input</code> text and <code>instructions</code> parameter payloads.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-6 max-w-4xl">
          {/* Sample Text Card */}
          <div className="card">
            <h2 className="title text-base font-bold">Standard Evaluation Prayer Text</h2>
            <blockquote className="mt-2 p-3 bg-beige/50 rounded border-l-4 border-wine text-sm italic text-ink">
              &ldquo;A Prayer for Grace and Peace. Heavenly Father, we humbly present our day to You. Grant us Your peace, illuminate our path, and strengthen our faith in all circumstances. Guide our words and actions so that we may bring glory to Your holy name. Amen.&rdquo;
            </blockquote>
          </div>

          {/* Model Selection Tabs */}
          <div className="flex gap-2 border-b border-line pb-3 overflow-x-auto">
            <button
              className={`tab-button ${activeTab === "current" ? "active" : ""}`}
              onClick={() => setActiveTab("current")}
            >
              Current Production Model (gpt-4o-mini-tts)
            </button>
            <button
              className={`tab-button ${activeTab === "legacy-hd" ? "active" : ""}`}
              onClick={() => setActiveTab("legacy-hd")}
            >
              Legacy tts-1-hd
            </button>
            <button
              className={`tab-button ${activeTab === "legacy-std" ? "active" : ""}`}
              onClick={() => setActiveTab("legacy-std")}
            >
              Legacy tts-1
            </button>
          </div>

          {/* Current gpt-4o-mini-tts Section */}
          {activeTab === "current" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between bg-beige/30 p-3 rounded-lg border border-line">
                <span className="text-xs font-bold uppercase tracking-wider text-muted">
                  Instruction Profile Style:
                </span>
                <div className="flex gap-2">
                  <button
                    className={`button compact ${selectedStyle === "gentle" ? "primary" : "secondary"}`}
                    onClick={() => setSelectedStyle("gentle")}
                  >
                    🕊️ Gentle Profile
                  </button>
                  <button
                    className={`button compact ${selectedStyle === "solemn" ? "primary" : "secondary"}`}
                    onClick={() => setSelectedStyle("solemn")}
                  >
                    🏛️ Solemn Profile
                  </button>
                </div>
              </div>

              <div className="card bg-beige/20 text-xs text-muted">
                <strong>Speech Instructions Parameter ({selectedStyle.toUpperCase()}):</strong>
                {selectedStyle === "gentle" ? (
                  <p className="italic mt-1">
                    &ldquo;Read slowly, warmly, and prayerfully. Use a calm devotional tone, natural pauses between sentences, restrained emotion, and clear pronunciation. Do not sound theatrical or like an advertisement.&rdquo;
                  </p>
                ) : (
                  <p className="italic mt-1">
                    &ldquo;Read in a reverent, measured, solemn tone. Use natural pauses and quiet conviction. Keep the delivery peaceful and restrained rather than dramatic, authoritative, or theatrical.&rdquo;
                  </p>
                )}
              </div>

              {/* Voice Samples Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {ALL_VOICES.map((voice) => {
                  const audioPath = `/samples/audio/current-model/sample-${voice}-${selectedStyle}.mp3`;
                  const isProdGentle = voice === "coral" && selectedStyle === "gentle";
                  const isProdSolemn = voice === "ash" && selectedStyle === "solemn";

                  return (
                    <div
                      key={voice}
                      className={`card flex flex-col justify-between gap-3 ${
                        isProdGentle || isProdSolemn ? "border-2 border-wine bg-beige/40" : ""
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <h3 className="title font-bold capitalize text-base flex items-center gap-1.5">
                            {voice}
                            {isProdGentle && (
                              <span className="text-xs text-wine font-bold">★ Gentle Default</span>
                            )}
                            {isProdSolemn && (
                              <span className="text-xs text-wine font-bold">★ Solemn Profile</span>
                            )}
                          </h3>
                          <span className="badge ready text-xs">gpt-4o-mini-tts</span>
                        </div>
                        <div className="text-xs text-muted mt-1 flex items-center justify-between">
                          <span>Style: {selectedStyle}</span>
                          <span>~285 KB</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 mt-2">
                        <audio controls src={audioPath} className="w-full h-9" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Legacy tts-1-hd Section */}
          {activeTab === "legacy-hd" && (
            <div className="flex flex-col gap-4">
              <div className="card bg-beige/30 border border-line">
                <span className="badge draft text-xs mb-1">Non-Production Comparison</span>
                <p className="text-sm text-ink font-semibold">
                  Legacy <code>tts-1-hd</code> speech model samples.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {ALL_VOICES.map((voice) => {
                  const audioPath = `/samples/audio/current-tts-1-hd/sample-${voice}-${selectedStyle}.mp3`;
                  return (
                    <div key={voice} className="card flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <h3 className="title font-bold capitalize text-base">{voice}</h3>
                          <span className="badge draft text-xs">tts-1-hd</span>
                        </div>
                        <div className="text-xs text-muted mt-1">
                          <span>~514 KB</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 mt-2">
                        <audio controls src={audioPath} className="w-full h-9" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Legacy tts-1 Section */}
          {activeTab === "legacy-std" && (
            <div className="flex flex-col gap-4">
              <div className="card bg-beige/30 border border-line">
                <span className="badge draft text-xs mb-1">Non-Production Comparison</span>
                <p className="text-sm text-ink font-semibold">
                  Legacy <code>tts-1</code> baseline samples.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {LEGACY_VOICES.map((voice) => {
                  const audioPath = `/samples/audio/sample-${voice}.mp3`;
                  return (
                    <div key={voice} className="card flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <h3 className="title font-bold capitalize text-base">{voice}</h3>
                          <span className="badge draft text-xs">tts-1 (legacy)</span>
                        </div>
                        <div className="text-xs text-muted mt-1">
                          <span>~246 KB</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 mt-2">
                        <audio controls src={audioPath} className="w-full h-9" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </AdminGate>
  );
}
