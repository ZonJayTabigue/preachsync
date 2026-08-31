import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function scriptPath(): string {
  return join(__dirname, "export-pptx-slides.ps1");
}

/**
 * Rasterize a PPTX with the installed copy of PowerPoint.
 * Returns one PNG buffer per slide, or null if PowerPoint is unavailable.
 */
export async function renderSlidesWithPowerPoint(
  pptxBuffer: Buffer,
): Promise<Buffer[] | null> {
  if (process.platform !== "win32") {
    return null;
  }

  const workDir = await mkdtemp(join(tmpdir(), "preachsync-pptx-"));
  const inputPath = join(workDir, "deck.pptx");
  const outputDir = join(workDir, "slides");

  try {
    await writeFile(inputPath, pptxBuffer);
    await mkdir(outputDir, { recursive: true });

    await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath(),
        "-InputPath",
        inputPath,
        "-OutputDir",
        outputDir,
      ],
      { timeout: 120_000, windowsHide: true },
    );

    const files = (await readdir(outputDir))
      .filter((name) => /^slide-\d+\.png$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (files.length === 0) {
      return null;
    }

    return Promise.all(files.map((name) => readFile(join(outputDir, name))));
  } catch (error: unknown) {
    console.warn(
      "[PreachSync] PowerPoint slide export is unavailable. Using images embedded in the .pptx file instead.",
      error,
    );
    return null;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
