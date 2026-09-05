"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminShell({ email, onSignOut, children }: { email: string; onSignOut: () => void; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (path: string) => pathname?.startsWith(path);

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div>
          <div className="brand">
            <span className="flex items-center gap-2">
              <span className="text-amber-500 text-lg">✦</span> My Prayer Altar
            </span>
            <small>Studio Admin</small>
          </div>
          <nav className="mt-8 flex flex-col gap-1.5" aria-label="Studio navigation">
            <p className="eyebrow px-3 mb-1 text-[10.5px]">Content</p>
            <Link className={`nav-link ${isActive("/content") ? "active" : ""}`} href="/content">Today Feed</Link>
            <Link className={`nav-link ${isActive("/calendar") ? "active" : ""}`} href="/calendar">Editorial Calendar</Link>
            <p className="eyebrow px-3 mt-5 mb-1 text-[10.5px]">Creation &amp; Publishing</p>
            <Link className={`nav-link ${isActive("/bible/stories") ? "active" : ""}`} href="/bible/stories">My Bible Studio</Link>
            <Link className={`nav-link ${isActive("/bible/entities") ? "active" : ""}`} href="/bible/entities">Canonical Entities</Link>
            <Link className={`nav-link ${pathname === "/settings/daily-prayer" ? "active" : ""}`} href="/settings/daily-prayer">Prayer Studio</Link>
            <Link className={`nav-link ${pathname === "/settings/today-schedule" ? "active" : ""}`} href="/settings/today-schedule">Today Schedule</Link>
            <Link className={`nav-link ${pathname === "/settings/ai-prompt" ? "active" : ""}`} href="/settings/ai-prompt">Personal Prayer AI</Link>

            <p className="eyebrow px-3 mt-5 mb-1 text-[10.5px]">Media</p>
            <Link className={`nav-link ${pathname === "/settings/media-library" ? "active" : ""}`} href="/settings/media-library">Media Library</Link>
            <Link className={`nav-link ${pathname === "/settings/audio" ? "active" : ""}`} href="/settings/audio">Audio Library</Link>

            <p className="eyebrow px-3 mt-5 mb-1 text-[10.5px]">Operations</p>
            <Link className={`nav-link ${pathname === "/settings/emergency-controls" ? "active" : ""}`} href="/settings/emergency-controls">Emergency Controls</Link>
            <Link className={`nav-link ${isActive("/ai-usage") ? "active" : ""}`} href="/ai-usage">AI Usage</Link>
            <Link className={`nav-link ${isActive("/db-usage") ? "active" : ""}`} href="/db-usage">Database Usage</Link>
            <Link className={`nav-link ${pathname === "/settings/storage" ? "active" : ""}`} href="/settings/storage">Storage Optimization</Link>
            <Link className={`nav-link ${isActive("/feedback") ? "active" : ""}`} href="/feedback">Alpha Feedback</Link>

            <p className="eyebrow px-3 mt-5 mb-1 text-[10.5px]">Administration</p>
            <Link className={`nav-link ${isActive("/users-access") ? "active" : ""}`} href="/users-access">Users &amp; Access</Link>
            <Link className={`nav-link ${pathname === "/settings/access-limits" ? "active" : ""}`} href="/settings/access-limits">Access &amp; Limits</Link>
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="admin-email">{email}</div>
          <button className="button secondary w-full text-xs" type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </aside>

      <div className="flex flex-col h-screen min-w-0 overflow-y-auto">
        <header className="mobile-bar">
          <Link href="/content" className="brand text-white text-lg flex items-center gap-2">
            <span className="text-amber-500 text-sm">✦</span> My Prayer Altar
          </Link>
          <button className="button secondary compact text-xs" type="button" onClick={onSignOut}>Sign out</button>
        </header>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}

