import { spawn } from "node:child_process";
import { parsedDocxContentSchema, type ParsedDocxContent } from "schema";
import { resolvePythonPath, resolveParserScriptPath } from "./resolve-python.js";

export type ParseDocxOptions = {
  pythonPath?: string;
};

export class DocxParseError extends Error {
  readonly stderr: string;

  constructor(message: string, stderr: string) {
    super(stderr ? `${message}\n${stderr}` : message);
    this.name = "DocxParseError";
    this.stderr = stderr;
  }
}

// Spawns the trimmed casinoParser.py against one docx/locale pair, captures
// its stdout as JSON, and validates it against ParsedDocxContent before
// handing it back — the Node side of the contract never trusts the Python
// side's output blindly.
export function parseDocx(
  docxPath: string,
  locale: string,
  options: ParseDocxOptions = {},
): Promise<ParsedDocxContent> {
  const pythonPath = resolvePythonPath(options.pythonPath);
  const scriptPath = resolveParserScriptPath();

  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, [scriptPath, "--docx", docxPath, "--locale", locale], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    child.on("error", (error) => {
      reject(
        new DocxParseError(
          `Failed to start "${pythonPath}". Is Python installed and on PATH, or is PYTHON_PATH set? (${error.message})`,
          stderr,
        ),
      );
    });

    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(new DocxParseError(`casinoParser.py exited with code ${exitCode}`, stderr));
        return;
      }

      let raw: unknown;
      try {
        raw = JSON.parse(stdout);
      } catch (error) {
        reject(
          new DocxParseError(
            `casinoParser.py did not print valid JSON to stdout: ${(error as Error).message}`,
            stderr,
          ),
        );
        return;
      }

      const result = parsedDocxContentSchema.safeParse(raw);
      if (!result.success) {
        reject(
          new DocxParseError(
            `casinoParser.py output failed ParsedDocxContent validation: ${result.error.message}`,
            stderr,
          ),
        );
        return;
      }

      resolve(result.data);
    });
  });
}
