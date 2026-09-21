import { AdminGate } from "@/components/AdminGate";
import { YouTubeVideoInbox } from "@/components/YouTubeVideoInbox";

export default function VideoInboxPage() {
  return <AdminGate><main className="page"><div className="page-head"><div><p className="eyebrow">YouTube automation</p><h1 className="title">Video inbox</h1><p className="description">Collect new videos as drafts for editorial review.</p></div></div><YouTubeVideoInbox /></main></AdminGate>;
}
