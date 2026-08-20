import type { Theme } from "schema";

export function cssVars(theme: Partial<Theme> = {}) {
  const primary = theme.primary ?? "#2563eb";
  const secondary = theme.secondary ?? "#111827";
  const accent = theme.accent ?? "#facc15";
  const background = theme.background ?? "#ffffff";
  const surface = theme.surface ?? "#f8fafc";
  const text = theme.text ?? "#1f2937";
  const mutedText = theme.mutedText ?? "#64748b";
  const border = theme.border ?? "rgba(15, 23, 42, 0.12)";
  const sectionBackground = theme.sectionBackground ?? "transparent";
  const sectionText = theme.sectionText ?? text;
  const headingText = theme.headingText ?? secondary;
  const link = theme.link ?? primary;
  const linkHover = theme.linkHover ?? secondary;

  return `
    --primary:${primary};
    --secondary:${secondary};
    --accent:${accent};
    --background:${background};
    --surface:${surface};
    --text:${text};
    --muted-text:${mutedText};
    --border:${border};
    --section-bg:${sectionBackground};
    --section-text:${sectionText};
    --heading-text:${headingText};
    --link:${link};
    --link-hover:${linkHover};
  `;
}
