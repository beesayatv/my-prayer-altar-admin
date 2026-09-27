"use client";
import { use } from "react";
import { DevotionEditor } from "@/components/devotions/DevotionEditor";
export default function DevotionPage({ params }: { params: Promise<{ id: string }> }) { return <DevotionEditor devotionId={use(params).id} />; }
