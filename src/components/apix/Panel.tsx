import type { ReactNode } from "react";

export function Panel({
  title,
  caption,
  aside,
  children,
  id,
  className = "",
}: {
  title?: string;
  caption?: string;
  aside?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section id={id} className={`frost scroll-mt-24 p-5 ${className}`}>
      {(title || aside) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && (
              <h2 className="font-display text-sm font-bold uppercase text-primary">{title}</h2>
            )}
            {caption && (
              <p className="num mt-1 text-[10px] uppercase text-faint">
                {caption}
              </p>
            )}
          </div>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "up" | "down" | "warn" }) {
  const toneClass =
    tone === "up"
      ? "text-up"
      : tone === "down"
        ? "text-down"
        : tone === "warn"
          ? "text-warn"
          : "text-foreground";
  return (
    <div className="flex items-center justify-between">
      <span className="num text-[10px] text-faint">{label}</span>
      <span className={`num text-[11px] ${toneClass}`}>{value}</span>
    </div>
  );
}
