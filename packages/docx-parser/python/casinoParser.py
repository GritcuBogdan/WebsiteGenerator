import argparse
import json
import re
import sys
import unicodedata

from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph


# Pure DOCX -> structured JSON extraction. No theme, no navbar/footer, no
# image paths, no casino display name, no URL/canonical construction — all
# of that is config/template-driven and lives in the Node pipeline
# (packages/codegen's assemble-site stage). This script's only job is
# turning the document's pages/sections/meta/FAQ into JSON matching
# packages/schema's ParsedDocxContent, printed to stdout.


# Order matters: page_slug_from_marker() returns on the first keyword match,
# and some of these compound legal-page phrases contain a shorter existing
# keyword as a substring (e.g. German "verantwortungsvolles spielen" contains
# "spiele", the bare keyword for "slots" below) — so the more specific
# phrases here must be checked first, ahead of the single-word entries.
CANONICAL_PAGE_SLUGS = [
    ("responsible-gaming", ("responsible gaming", "responsible gambling", "verantwortungsvolles spielen", "ansvarlig spilling", "υπεύθυνο παιχνίδι")),
    ("privacy-policy", ("privacy policy", "datenschutz", "personvern", "απορρήτου")),
    ("cookies-policy", ("cookie", "cookies", "cookie-richtlinie", "informasjonskapsler")),
    ("betting-rules", ("betting rules", "game rules", "spielregeln", "spilleregler", "κανόνες στοιχηματισμού")),
    ("terms-conditions", ("terms and conditions", "terms & conditions", "agb", "allgemeine geschäftsbedingungen", "vilkår", "όροι")),
    ("contacts", ("contact", "kontakt", "επικοινωνία")),
    ("no-deposit-bonus", ("no deposit", "no-deposit", "bonus ohne einzahlung", "uten innskudd")),
    ("free-spins", ("free spins", "freespins", "freispiele")),
    ("promo-code", ("promo code", "promocode", "promo", "aktionscode", "kampanjekode")),
    ("withdrawal", ("withdrawal", "withdraw", "cash-out", "cash out", "cashout", "auszahlung", "uttak")),
    ("review", ("review", "bewertung", "anmeldelse")),
    ("login", ("login", "sign-in", "sign in", "anmeldung", "logg inn", "innlogging")),
    ("slots", ("slots", "games", "spiele", "spilleautomater")),
    ("bonus", ("bonus", "bonuses", "boni")),
    ("index", ("home", "главная", "startseite")),
    ("application", ("application", "registration", "registrierung", "registrering")),
]


# Letters with no canonical Unicode decomposition, so NFKD leaves them
# untouched and the ascii encode/ignore step below silently drops them
# rather than transliterating them (unlike e.g. "å", which decomposes into
# "a" + a combining ring and survives NFKD just fine on its own).
TRANSLITERATIONS = {
    "æ": "ae", "Æ": "AE",
    "ø": "o", "Ø": "O",
    "ß": "ss",
    "þ": "th", "Þ": "TH",
    "ð": "d", "Ð": "D",
}


def slugify(value, fallback="section"):
    value = value or ""
    for char, replacement in TRANSLITERATIONS.items():
        value = value.replace(char, replacement)
    value = unicodedata.normalize("NFKD", value)
    value = value.encode("ascii", "ignore").decode("ascii")
    value = value.lower().replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or fallback


def unique_id(value, used_ids, fallback_prefix="section"):
    base = slugify(value, fallback=f"{fallback_prefix}-{len(used_ids) + 1}")
    candidate = base
    counter = 2

    while candidate in used_ids:
        candidate = f"{base}-{counter}"
        counter += 1

    used_ids.add(candidate)
    return candidate


def clean_marker_title(marker):
    # Page markers follow "<word> <number> -" regardless of language
    # (SEITE 1 -, СТРАНИЦА 1 -, SIDE 1 -, ...) - matched structurally so a
    # new language never needs another hardcoded word here.
    title = re.sub(r"^\s*\S+\s+\d+\s*-\s*", "", marker, flags=re.I)
    title = re.sub(r"\s*-\s*~?\d+\s*Wörter\s*$", "", title, flags=re.I)
    title = re.sub(r"\s*-\s*~?\d+\s*слов\s*$", "", title, flags=re.I)
    title = re.sub(r"\s*\(HUB\)\s*", " ", title, flags=re.I)
    title = re.sub(r"\s*\(HUB\)\s*", " ", title, flags=re.I)
    title = re.sub(r"\s+", " ", title).strip()

    home_match = re.search(r"\((home|startseite)\)", title, flags=re.I)
    if home_match:
        return home_match.group(1).title()

    return title or "Page"


def page_slug_from_marker(marker):
    marker_lower = marker.lower()
    for slug, keywords in CANONICAL_PAGE_SLUGS:
        if any(keyword in marker_lower for keyword in keywords):
            return slug
    return slugify(clean_marker_title(marker), "page")


def extract_blocks(docx_path):
    document = Document(docx_path)
    blocks = []

    for child in document.element.body.iterchildren():
        if isinstance(child, CT_P):
            paragraph = Paragraph(child, document)
            text = paragraph.text.strip()
            if text:
                blocks.append(
                    {
                        "kind": "p",
                        "style": paragraph.style.name,
                        "text": text,
                    }
                )
        elif isinstance(child, CT_Tbl):
            table = Table(child, document)
            rows = [
                [cell.text.strip().replace("\n", " | ") for cell in row.cells]
                for row in table.rows
            ]
            rows = [row for row in rows if any(cell for cell in row)]
            if rows:
                blocks.append({"kind": "table", "rows": rows})

    return blocks


PAGE_MARKER_PATTERN = re.compile(r"^\s*\S+\s+\d+\s*-", re.IGNORECASE)


def split_doc_pages(blocks):
    pages = []
    current_page = None

    for item in blocks:
        # Structural match ("<word> <number> -"), not a hardcoded list of
        # per-language words for "page" (SEITE/СТРАНИЦА/SIDE/...) - every
        # source docx so far follows this convention regardless of language.
        is_page_marker = (
                item["kind"] == "p"
                and item["style"] == "Heading 2"
                and PAGE_MARKER_PATTERN.match(item["text"])
        )

        if is_page_marker:
            if current_page:
                pages.append(current_page)
            current_page = {"marker": item["text"], "items": []}
        elif current_page:
            current_page["items"].append(item)

    if current_page:
        pages.append(current_page)

    if not pages:
        raise ValueError('No pages found. Expected Heading 2 markers starting with "SEITE" or "СТРАНИЦА".')

    return pages


def split_label_value(line):
    if ":" not in line:
        return None, None
    label, value = line.split(":", 1)
    return label.strip().lower(), value.strip()


def prune_none(mapping):
    return {key: value for key, value in mapping.items() if value is not None}


# A per-page word-count note ("Antall ord: ~1560", "Anzahl Wörter: ~1560",
# ...) that precedes the meta title/description/H1 block in some docx
# sources. It carries no content the site needs, but consume_page_meta must
# still recognize and discard it - otherwise it stops at this line before
# ever reaching the real meta block right after it, and the count leaks
# into the page as a bogus first paragraph instead.
WORD_COUNT_LABELS = {"antall ord", "word count", "anzahl wörter", "количество слов"}


def consume_page_meta(items):
    meta = {"title": None, "description": None, "h1": None}
    body_start = 0

    while body_start < len(items) and items[body_start]["kind"] == "p":
        text = items[body_start]["text"].strip()
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        consumed_any = False

        for line in lines:
            label, value = split_label_value(line)
            if label in {"meta title", "metatitle", "meta-titel"}:
                meta["title"] = value
                consumed_any = True
            elif label in {"meta description", "metadescription", "meta-beschreibung"}:
                meta["description"] = value
                consumed_any = True
            elif label in {"h1", "h1-titel"}:
                meta["h1"] = value
                consumed_any = True
            elif label in WORD_COUNT_LABELS:
                consumed_any = True

        if consumed_any:
            body_start += 1
            continue

        break

    return meta, items[body_start:]


def is_navigation_heading(text):
    normalized = text.strip().lower()
    nav_keywords = {
        "navigation", "menu", "contents", "навигация", "плоήγηση", "πλοήγηση",
        "navigations", "navigationsbereich", "inhalt", "übersicht",
        "navigasjon", "meny"
    }
    return normalized in nav_keywords


HEADING_LABEL_PREFIX = re.compile(r"^h[1-6]\s*[:\-]\s*", re.IGNORECASE)


def strip_heading_label(text):
    # Some docx sources (seen alongside a total absence of Word heading
    # styles - see promote_missing_heading3() below) mark heading levels
    # with a literal "H2:"/"H3:" text prefix instead of applying the
    # matching style. "H1:" is already stripped separately by
    # consume_page_meta(), but H2/H3 reach here untouched and would
    # otherwise render as literal, visible text in front of every section
    # title and FAQ question.
    return HEADING_LABEL_PREFIX.sub("", text.strip(), count=1).strip()


# Labels consume_page_meta()/extract_intro_and_sections() pull out of the
# body by prefix, regardless of paragraph style - never real headings even
# though they're often short and unpunctuated like one.
NON_HEADING_LABELS = (
    {"meta title", "metatitle", "meta-titel"}
    | {"meta description", "metadescription", "meta-beschreibung"}
    | {"h1", "h1-titel"}
    | {"hero banner", "banner", "hero-banner"}
    | WORD_COUNT_LABELS
)

HEADING_CANDIDATE_MAX_LEN = 80
HEADING_TERMINAL_PUNCTUATION = ".!?:;)…”»\"'"


def looks_like_heading(text):
    text = text.strip()
    if not text or len(text) > HEADING_CANDIDATE_MAX_LEN:
        return False
    if PAGE_MARKER_PATTERN.match(text):
        return False
    label, _ = split_label_value(text)
    if label and label in NON_HEADING_LABELS:
        return False
    return text[-1] not in HEADING_TERMINAL_PUNCTUATION


def promote_missing_heading3(blocks):
    # Some source docs (seen so far only in fully-translated locale copies)
    # never use the Heading 3 style at all - every subsection title, and the
    # "Navigation" list of link titles right underneath the hero, is a plain
    # paragraph indistinguishable by style from body text. Without a single
    # Heading 3 in the page, extract_intro_and_sections() has no boundary to
    # stop at: it swallows the *entire* rest of the page into the intro (or
    # into the unused parsed-nav list), and no other sections ever get
    # built. Restyling every heading-shaped line (short, no closing
    # punctuation, not a recognized label) as Heading 3 fixes this - it also
    # incidentally re-promotes the "Navigation" list's duplicate titles, but
    # those end up as zero-paragraph sections downstream and get dropped by
    # process_section()'s "no blocks -> no section" check, exactly like the
    # real headings they duplicate would if content were missing.
    #
    # Gated on the *whole document* having no Heading 3 at all, not per-page,
    # so a document that already styles headings correctly elsewhere never
    # has this heuristic override real authoring.
    if any(block["kind"] == "p" and block["style"] == "Heading 3" for block in blocks):
        return blocks

    for block in blocks:
        if block["kind"] == "p" and block["style"] != "Heading 2" and looks_like_heading(block["text"]):
            block["style"] = "Heading 3"

    return blocks


def extract_intro_and_sections(items, page_title, is_home, used_ids):
    intro_paragraphs = []
    banner_text = ""
    navigation = []
    sections = []
    index = 0

    while index < len(items):
        item = items[index]

        # The "Navigation" marker (and its list of link titles right below
        # it) is a table of contents, not body copy - it must never leak
        # into the intro paragraphs regardless of what style the docx
        # author gave it. Checked on every paragraph, not gated behind
        # "Heading 3", because source docs have been inconsistent about
        # styling this line (some use Heading 3, some leave it as Normal).
        if item["kind"] == "p" and is_navigation_heading(item["text"]):
            index += 1
            while index < len(items):
                nav_item = items[index]
                if nav_item["kind"] == "p" and nav_item["style"] == "Heading 3":
                    break
                if nav_item["kind"] == "p":
                    nav_title = strip_heading_label(nav_item["text"])
                    if nav_title:
                        navigation.append(
                            {
                                "title": nav_title,
                                "href": f"#{slugify(nav_title, 'section')}",
                            }
                        )
                index += 1
            continue

        if item["kind"] == "p" and item["style"] == "Heading 3":
            break

        if item["kind"] == "p":
            label, value = split_label_value(item["text"])
            if label and label in {"hero banner", "banner", "hero-banner", "hero-banner:"}:
                banner_text = value
            else:
                intro_paragraphs.append(item["text"])
        elif item["kind"] == "table":
            break

        index += 1

    if is_home:
        # The hero/intro is a narrow, large-font layout meant for a single
        # short tagline - it's not a general text container. A docx author
        # occasionally leaves a second (often long) paragraph in this spot
        # before the "Hero banner:"/"Navigation" markers instead of giving
        # it its own Heading 3 section further down; left in place, that
        # paragraph blows out the hero's height instead of just the intended
        # one-liner. So only the first paragraph stays in the hero, and any
        # extra paragraphs are demoted to a plain, untitled section directly
        # underneath it - i.e. underneath the on-page navigation, which
        # always renders right after the hero.
        intro_section = {
            "type": "intro",
            "id": "intro",
            "title": page_title,
            "paragraphs": intro_paragraphs[:1],
            "navigation": navigation,
        }
        if banner_text:
            intro_section["bannerText"] = banner_text
        sections.append(intro_section)

        overflow_paragraphs = intro_paragraphs[1:]
        if overflow_paragraphs:
            sections.append(
                {
                    "type": "text",
                    "id": unique_id("", used_ids, "intro-note"),
                    "title": "",
                    "paragraphs": overflow_paragraphs,
                }
            )
    elif intro_paragraphs:
        sections.append(
            {
                "type": "text",
                "id": unique_id(page_title, used_ids, "intro"),
                "title": page_title,
                "paragraphs": intro_paragraphs,
            }
        )

    cursor = index
    while cursor < len(items):
        item = items[cursor]
        if item["kind"] == "p" and item["style"] == "Heading 3":
            title = strip_heading_label(item["text"])
            cursor += 1
            segment = []

            while cursor < len(items):
                next_item = items[cursor]
                if next_item["kind"] == "p" and next_item["style"] == "Heading 3":
                    break
                segment.append(next_item)
                cursor += 1

            if is_navigation_heading(title):
                continue

            section = process_section(title, segment, used_ids)
            if section:
                sections.append(section)
        else:
            cursor += 1

    return sections


def is_question_like(text):
    text = strip_heading_label(text)
    if text.endswith("?") or text.endswith("?") or text.endswith("?") or text.endswith("¿"):
        return True
    mark_pos = text.find("?")
    if mark_pos == -1:
        mark_pos = text.find("¿")
    return mark_pos != -1 and mark_pos < len(text) - 1


def looks_like_faq_segment(items):
    # Structural stand-in for a title check: a segment where a solid share
    # of the paragraphs are question-like (either "question, then answer"
    # as two paragraphs, or "question? answer." merged into one - see
    # is_question_like()) is an FAQ block regardless of what its heading
    # says. Titling this by keyword instead (as process_section used to)
    # means every new docx language needs its own hardcoded phrase added
    # here first - the same trap clean_marker_title()'s page-marker
    # matching deliberately avoids.
    p_items = [item for item in items if item["kind"] == "p"]
    if len(p_items) < 2:
        return False
    question_like = sum(1 for item in p_items if is_question_like(item["text"]))
    return question_like >= 2 and question_like / len(p_items) >= 0.4


def process_section(title, items, used_ids):
    section_id = unique_id(title, used_ids)
    title_lower = title.lower()

    # Keyword check stays as a cheap fast-path (covers e.g. a 2-question FAQ
    # too short for the structural ratio below to be reliable); the
    # structural check in looks_like_faq_segment() is what makes this work
    # for a language this list doesn't happen to name.
    faq_keywords = {
        "faq", "frequently asked questions", "häufig gestellte fragen",
        "fragen und antworten", "fragen & antworten", "common questions",
        "question", "ερωτήσεις", "часто задаваемые вопросы",
        "ofte stilte spørsmål"
    }
    if any(keyword in title_lower for keyword in faq_keywords) or looks_like_faq_segment(items):
        faqs = parse_faq(items)
        if faqs:
            return {"type": "faq", "id": section_id, "title": title, "items": faqs}

    blocks = content_blocks(items)
    if not blocks:
        return None

    if len(blocks) == 1 and blocks[0]["type"] == "text":
        return {
            "type": "text",
            "id": section_id,
            "title": title,
            "paragraphs": blocks[0]["paragraphs"],
        }

    return {"type": "content", "id": section_id, "title": title, "blocks": blocks}


def parse_faq(items):
    faqs = []
    current_question = None
    current_answer_parts = []

    for item in items:
        if item["kind"] != "p":
            continue

        text = strip_heading_label(item["text"])

        # Some docx sources (seen in translated locale copies) keep a
        # question and its answer on one paragraph instead of two separate
        # ones - split on the first "?" whenever it isn't the paragraph's
        # own ending, so a merged line still produces a real Q/A pair
        # instead of silently vanishing (a non-"?"-ending paragraph with no
        # current_question yet is otherwise just dropped below).
        mark_pos = text.find("?")
        if mark_pos == -1:
            mark_pos = text.find("¿")
        if mark_pos != -1 and mark_pos < len(text) - 1:
            if current_question and current_answer_parts:
                faqs.append({
                    "question": current_question,
                    "answer": " ".join(current_answer_parts).strip()
                })
            faqs.append({
                "question": text[: mark_pos + 1].strip(),
                "answer": text[mark_pos + 1:].strip(" -–—").strip(),
            })
            current_question = None
            current_answer_parts = []
            continue

        # Check if line ends with ? or ? (question mark in various languages)
        if text.endswith("?") or text.endswith("?") or text.endswith("?") or text.endswith("¿"):
            if current_question and current_answer_parts:
                faqs.append({
                    "question": current_question,
                    "answer": " ".join(current_answer_parts).strip()
                })
            current_question = text
            current_answer_parts = []
        else:
            if current_question:
                current_answer_parts.append(text)

    # Add the last FAQ
    if current_question and current_answer_parts:
        faqs.append({
            "question": current_question,
            "answer": " ".join(current_answer_parts).strip()
        })

    # Fallback: split by newlines
    if not faqs:
        for item in items:
            if item["kind"] != "p":
                continue
            parts = [part.strip() for part in item["text"].splitlines() if part.strip()]
            if len(parts) >= 2:
                faqs.append({"question": parts[0], "answer": " ".join(parts[1:])})

    return faqs


def table_block(rows):
    if len(rows) == 1:
        return {"type": "table", "columns": rows[0], "rows": []}
    return {"type": "table", "columns": rows[0], "rows": rows[1:]}


def content_blocks(items):
    blocks = []
    paragraphs = []
    index = 0

    def flush_text():
        nonlocal paragraphs
        if paragraphs:
            blocks.append({"type": "text", "paragraphs": paragraphs})
            paragraphs = []

    while index < len(items):
        item = items[index]
        if item["kind"] == "table":
            flush_text()
            blocks.append(table_block(item["rows"]))
            index += 1
            continue

        text = item["text"].strip()
        # Check for list pattern (lines ending with colon)
        if text.endswith(":") or text.endswith(":") or text.endswith(":"):
            list_items = []
            cursor = index + 1
            while cursor < len(items) and items[cursor]["kind"] == "p":
                candidate = items[cursor]["text"].strip()
                if candidate.endswith(":") or candidate.endswith(":") or candidate.endswith(":"):
                    break
                if "\n" in candidate:
                    break
                list_items.append(candidate)
                cursor += 1

            if len(list_items) >= 2:
                paragraphs.append(text)
                flush_text()
                blocks.append({"type": "list", "items": list_items})
                index = cursor
                continue

        paragraphs.append(text)
        index += 1

    flush_text()
    return blocks


def build_pages(doc_pages):
    pages = []
    used_ids = set()

    for doc_page in doc_pages:
        marker = doc_page["marker"]
        page_slug = page_slug_from_marker(marker)
        marker_title = clean_marker_title(marker)
        meta, body_items = consume_page_meta(doc_page["items"])
        page_title = meta.get("h1") or marker_title

        sections = extract_intro_and_sections(
            body_items,
            page_title,
            page_slug == "index",
            used_ids,
        )

        pages.append(
            {
                "slug": page_slug,
                "title": page_title,
                "navLabel": "Home" if page_slug == "index" else marker_title,
                "meta": prune_none(meta),
                "sections": sections,
            }
        )

    if not any(page["slug"] == "index" for page in pages):
        pages[0]["slug"] = "index"

    dedupe_page_slugs(pages)
    return pages


def dedupe_page_slugs(pages):
    seen = {}
    for page in pages:
        slug = page["slug"]
        if slug not in seen:
            seen[slug] = 1
            continue

        seen[slug] += 1
        page["slug"] = f"{slug}-{seen[slug]}"


def build_parsed_content(docx_path, locale):
    blocks = extract_blocks(docx_path)
    blocks = promote_missing_heading3(blocks)
    doc_pages = split_doc_pages(blocks)

    return {
        "locale": locale,
        "pages": build_pages(doc_pages),
    }


def parse_args():
    parser = argparse.ArgumentParser(
        description="Extract a structured casino DOCX into JSON (ParsedDocxContent). "
                     "Prints JSON to stdout; diagnostics go to stderr.",
    )
    parser.add_argument("--docx", required=True, help="Input .docx path")
    parser.add_argument("--locale", required=True, help="Locale code for this docx, e.g. en, de, el")
    return parser.parse_args()


def main():
    args = parse_args()
    result = build_parsed_content(args.docx, args.locale)

    print(json.dumps(result, ensure_ascii=False))
    print(f"[casinoParser] Parsed {len(result['pages'])} pages from {args.docx}", file=sys.stderr)


if __name__ == "__main__":
    main()
