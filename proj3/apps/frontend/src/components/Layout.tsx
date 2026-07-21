import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Home", end: true },
  { to: "/agent", label: "Learning Agent" },
  { to: "/knowledge", label: "Knowledge" },
  { to: "/interviews", label: "Interviews" },
  { to: "/chat", label: "Chat" },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-paper)]">
      <header className="h-14 border-b border-[var(--color-rule)] bg-[var(--color-paper-raised)]">
        <div className="mx-auto flex h-full max-w-5xl items-center gap-8 px-4 sm:px-6">
          <span className="font-display text-base text-[var(--color-ink)]">AI Learning Agent</span>
          <nav className="flex items-center gap-5 font-body text-sm">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive
                    ? "font-medium text-[var(--color-accent)]"
                    : "text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)]"
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      {/* Each page owns its own max-width/padding container, matching the
          existing InterviewHistoryPage/InterviewResultPage convention, so
          this wrapper stays unconstrained to avoid doubling up spacing. */}
      <main>{children}</main>
    </div>
  );
}
