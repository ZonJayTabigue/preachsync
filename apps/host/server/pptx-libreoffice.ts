import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync(process.platform === "win32" ? "where" : "which", [
      command,
    ]);
    return true;
  } catch {
    return false;
  }
}

async function resolveCommand(
  candidates: string[],
): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (await commandExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Rasterize a PPTX with LibreOffice + pdftoppm (typical on Linux/Render).
 */
export async function renderSlidesWithLibreOffice(
  pptxBuffer: Buffer,
): Promise<Buffer[] | null> {
  const soffice = await resolveCommand([
    "soffice",
    "libreoffice",
    "/usr/bin/soffice",
    "/usr/bin/libreoffice",
  ]);
  const pdftoppm = await resolveCommand(["pdftoppm", "/usr/bin/pdftoppm"]);

  if (!soffice || !pdftoppm) {
    return null;
  }

  const workDir = await mkdtemp(join(tmpdir(), "preachsync-lo-"));
  const inputPath = join(workDir, "deck.pptx");
  const pdfDir = join(workDir, "pdf");
  const pngDir = join(workDir, "png");

  try {
    await writeFile(inputPath, pptxBuffer);
    await mkdir(pdfDir, { recursive: true });
    await mkdir(pngDir, { recursive: true });

    await execFileAsync(
      soffice,
      [
        "--headless",
        "--nologo",
        "--nolockcheck",
        "--norestore",
        "--convert-to",
        "pdf",
        "--outdir",
        pdfDir,
        inputPath,
      ],
      {
        timeout: 180_000,
        env: {
          ...process.env,
          HOME: workDir,
          SAL_USE_VCLPLUGIN: "svp",
        },
      },
    );

    const pdfFiles = (await readdir(pdfDir)).filter((name) =>
      name.toLowerCase().endsWith(".pdf"),
    );
    if (pdfFiles.length === 0) {
      return null;
    }

    const pdfPath = join(pdfDir, pdfFiles[0]);
    const prefix = join(pngDir, "slide");
    await execFileAsync(pdftoppm, ["-png", "-r", "144", pdfPath, prefix], {
      timeout: 120_000,
    });

    const files = (await readdir(pngDir))
      .filter((name) => /^slide-\d+\.png$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (files.length === 0) {
      return null;
    }

    return Promise.all(files.map((name) => readFile(join(pngDir, name))));
  } catch (error: unknown) {
    console.warn(
      "[PreachSync] LibreOffice slide export is unavailable.",
      error,
    );
    return null;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
