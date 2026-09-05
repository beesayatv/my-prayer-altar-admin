"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Daily Prayer", href: "/settings/daily-prayer" },
  { label: "My Altar", href: "/settings/ai-prompt" },
];

/** A compact local switcher; the sidebar deliberately stays at the area level. */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="settings-switcher" aria-label="Configuration area">
      {navItems.map((item) => (
        <Link key={item.href} href={item.href} className={pathname === item.href ? "active" : ""}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
