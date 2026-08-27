// The character-budget fitter behind every page title/description
// (build-page-seo.ts).
//
// Both strings are built as an ORDERED LIST OF FRAGMENTS with per-fragment
// fallbacks rather than as one format string, because the same formula has
// to fit a brand called "Nutz" and a page called "Allgemeine
// Geschäftsbedingungen" inside the same 70 characters. One format string
// can only ever be all-or-nothing about that.
//
// The budget is spent in two directions, and the directions are the whole
// point:
//
//   OPTIONAL fragments shrink BACK TO FRONT — the last one walks all the
//   way through its variants and is then dropped entirely before the one
//   in front of it is touched at all. Nibbling evenly instead would
//   downgrade real payment method names ("Visa, Mastercard, Skrill") to
//   generic wording while a fully droppable advice sentence was still
//   sitting at the end of the string.
//
//   REQUIRED fragments shrink FRONT TO BACK — the leading fragment is the
//   page identity, which has cheap alternatives (a shorter localized page
//   label, the humanized slug); the fragments behind it carry the
//   contractual casino term and the geo, which have nowhere to go. Going
//   the other way would let a long page label crowd the country out of the
//   title.
//
// Only once every fragment has been reduced as far as it can go does
// anything get truncated, and then at a word boundary.

export type SeoFragment = {
  id: string;
  // Required fragments are never dropped; optional ones are dropped last,
  // after their own variants are exhausted.
  required: boolean;
  // Longest/best first, shortest/cheapest last. Empty strings are ignored.
  variants: string[];
  // Last resort for a required fragment, tried only after every static
  // variant has failed: gets exactly the budget the other fragments left
  // over and must return something no longer than that. This is what keeps
  // a 30-character page label from pushing the country out of a title —
  // the label shrinks to whatever room is left instead of the geo fragment
  // being the thing that gives way.
  shrinkToFit?: (remaining: number) => string;
};

type FragmentState = { variant: number; dropped: boolean; override?: string };

function renderFragments(fragments: SeoFragment[], state: FragmentState[], joiner: string): string {
  return fragments
    .map((fragment, index) => {
      const current = state[index];
      if (current.dropped) return undefined;
      return current.override ?? fragment.variants[current.variant];
    })
    .filter((value): value is string => value !== undefined && value.length > 0)
    .join(joiner);
}

// Cuts to `budget` at the last word boundary, then strips any separator or
// punctuation left dangling at the end. Falls back to a hard cut only when
// the last word boundary is so early that a word-boundary cut would throw
// away most of the string.
export function truncateAtWordBoundary(value: string, budget: number): string {
  if (value.length <= budget) return value;
  const hard = value.slice(0, budget);
  const lastSpace = hard.lastIndexOf(" ");
  const cut = lastSpace > budget * 0.5 ? hard.slice(0, lastSpace) : hard;
  return cut.replace(/[\s|,;:._\-–—]+$/u, "").trim();
}

export function fitFragments(fragments: SeoFragment[], budget: number, joiner: string): string {
  const usable = fragments
    .map((fragment) => ({ ...fragment, variants: fragment.variants.filter((variant) => variant.trim().length > 0) }))
    .filter((fragment) => fragment.variants.length > 0);
  if (usable.length === 0) return "";

  const state: FragmentState[] = usable.map(() => ({ variant: 0, dropped: false }));
  const render = () => renderFragments(usable, state, joiner);
  if (render().length <= budget) return render();

  // 1. Optional fragments, back to front: exhaust this one's variants,
  //    then drop it, before looking at the one before it.
  for (let index = usable.length - 1; index >= 0; index--) {
    if (usable[index].required) continue;
    while (state[index].variant < usable[index].variants.length - 1) {
      state[index].variant++;
      if (render().length <= budget) return render();
    }
    state[index].dropped = true;
    if (render().length <= budget) return render();
  }

  // 2. Required fragments, front to back: the page identity gives way
  //    before the casino term and the geo behind it do.
  for (let index = 0; index < usable.length; index++) {
    if (!usable[index].required) continue;
    while (state[index].variant < usable[index].variants.length - 1) {
      state[index].variant++;
      if (render().length <= budget) return render();
    }
  }

  // 3. Only now, with every fragment already on its cheapest written
  //    variant, does anything get mechanically cut down. Doing this inside
  //    the loop above would crush the page identity while the fragment
  //    behind it still had a shorter phrasing available — the front-to-back
  //    rule is about which fragment gives up its *alternatives* first, not
  //    about mangling the first one before the others have tried at all.
  for (let index = 0; index < usable.length; index++) {
    const shrinkToFit = usable[index].shrinkToFit;
    if (!usable[index].required || !shrinkToFit) continue;
    const others = usable.filter((_, otherIndex) => otherIndex !== index && !state[otherIndex].dropped).length;
    const withoutThis = renderFragments(
      usable,
      state.map((entry, otherIndex) => (otherIndex === index ? { ...entry, dropped: true } : entry)),
      joiner,
    );
    // Whatever the other (already fully reduced) fragments and their
    // joiners leave behind. Below a few characters there is no honest
    // label left to write, so this stops rather than emitting a stub.
    const remaining = budget - withoutThis.length - (others > 0 ? joiner.length : 0);
    if (remaining < 8) continue;
    state[index].override = shrinkToFit(remaining);
    if (render().length <= budget) return render();
    state[index].override = undefined;
  }

  // 4. Last resort.
  return truncateAtWordBoundary(render(), budget);
}
