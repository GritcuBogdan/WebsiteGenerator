# docx-parser

Extracts a structured casino DOCX into JSON matching `schema`'s
`ParsedDocxContent` — pages, sections, meta, FAQ only. No theme, navbar,
footer, image paths, or casino display name: those are config/template
concerns handled later in the pipeline (`packages/codegen`'s assemble-site
stage), not the parser's job.

## Setup (one-time)

The extraction logic (`python/casinoParser.py`) is Python, using
`python-docx`. Node calls it as a subprocess and validates its stdout.

```
cd packages/docx-parser
python -m venv .venv
.venv/Scripts/pip install -r python/requirements.txt   # .venv/bin/pip on macOS/Linux
```

`parseDocx()` automatically finds this `.venv` if it exists (see
`src/resolve-python.ts`) — no environment variable needed once it's set up.
Override with `PYTHON_PATH` or the `pythonPath` option if you want a
different interpreter.

## Usage

```ts
import { parseDocx } from "docx-parser";

const content = await parseDocx("sites/golisimo/casino.en.docx", "en");
// content: ParsedDocxContent, already schema-validated
```

## Regenerating the test fixture

`test/fixtures/sample.docx` is generated, not hand-edited in Word:

```
.venv/Scripts/python test/fixtures/build-sample.py
```
