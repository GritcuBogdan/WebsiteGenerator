import type { Theme } from "schema";

// casino-v1's cssVars sources background/surface/text straight off the
// site's Theme because that template *is* a light, card-on-white design —
// every existing site's theme.json was tuned for that look. casino-v2 is a
// deliberately different, dark-premium design (see design notes in
// global.css), so its base chrome (background/surface/text/border) is
// fixed here rather than inherited from theme.background/theme.surface —
// otherwise every existing light-tuned site config would produce a
// washed-out, low-contrast dark page. Brand identity still comes through:
// primary/secondary/accent (the colors a site actually configures to stand
// out) drive every CTA, glow, and highlight. navbarBackground/navbarText/
// footerBackground/footerText remain per-site overrides, same contract as
// casino-v1, falling back to this template's dark chrome instead of to
// `surface`.
export function cssVars(theme: Partial<Theme> = {}) {
  const primary = theme.primary ?? "#8B5CF6";
  const secondary = theme.secondary ?? "#F5C542";
  const accent = theme.accent ?? theme.secondary ?? "#F5C542";
  const link = theme.link ?? primary;
  const linkHover = theme.linkHover ?? accent;

  const background = "#0A0A14";
  const surface = "#151426";
  const surfaceMuted = "#1D1B33";
  const text = "#F3F1FA";
  const mutedText = theme.mutedText ?? "#A6A2C4";
  const border = theme.border ?? "rgba(255, 255, 255, 0.10)";
  const headingText = "#FFFFFF";

  const navbarBackground = theme.navbarBackground ?? "rgba(10, 10, 20, 0.85)";
  const navbarText = theme.navbarText ?? text;
  const footerBackground = theme.footerBackground ?? "#07070F";
  const footerText = theme.footerText ?? mutedText;
  const rowColor = theme.rowColor ?? surfaceMuted;
  const rowTextColor = theme.rowTextColor ?? text;

  return `
    --primary:${primary};
    --secondary:${secondary};
    --accent:${accent};
    --background:${background};
    --surface:${surface};
    --surface-muted:${surfaceMuted};
    --text:${text};
    --muted-text:${mutedText};
    --border:${border};
    --heading-text:${headingText};
    --link:${link};
    --link-hover:${linkHover};
    --navbar-bg:${navbarBackground};
    --navbar-text:${navbarText};
    --footer-bg:${footerBackground};
    --footer-text:${footerText};
    --row-color:${rowColor};
    --row-text-color:${rowTextColor};
  `;
}
