import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vscode from 'vscode';
import { VISION_IMAGE_MAX_RAW_BYTES } from '../consts';
import { logger } from '../logger';

/**
 * Agent-mode tool that loads an image file from disk and returns its pixels
 * as a LanguageModelDataPart. Copilot Chat sends file references (drag-in,
 * #file, Add Context) to the model as a path, not as image data — so without
 * this tool the model can name an image it cannot see. The tool closes that
 * gap: the model calls it with the path, and the returned image flows back
 * through the normal request pipeline (inline base64 on the native-vision
 * variants, described text via the vision proxy on the text-only ones).
 */
export const VIEW_IMAGE_TOOL_NAME = 'deepseek-pilot_viewImage';

export interface ViewImageInput {
  path: string;
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

function textResult(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

/**
 * Resolve the model-supplied path to candidate absolute paths: a file:// URI
 * and an absolute path resolve to themselves; a relative path is tried
 * against every workspace folder root.
 */
function candidatePaths(raw: string): string[] {
  if (raw.startsWith('file://')) {
    try {
      return [fileURLToPath(raw)];
    } catch {
      return [];
    }
  }
  if (path.isAbsolute(raw)) return [raw];
  const folders = vscode.workspace.workspaceFolders ?? [];
  return folders.map((folder) => path.join(folder.uri.fsPath, raw));
}

export class ViewImageTool implements vscode.LanguageModelTool<ViewImageInput> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ViewImageInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const raw = (options.input?.path ?? '').trim().replace(/^["']|["']$/g, '');
    if (!raw) {
      return textResult('No image path provided. Pass the path of the image file to view.');
    }

    const ext = path.extname(raw).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime) {
      return textResult(
        `Unsupported image type "${ext || '(none)'}". Supported extensions: ${Object.keys(MIME_BY_EXT).join(', ')}.`,
      );
    }

    const candidates = candidatePaths(raw);
    let resolved: string | undefined;
    let size = 0;
    for (const candidate of candidates) {
      try {
        const stat = await fs.stat(candidate);
        if (stat.isFile()) {
          resolved = candidate;
          size = stat.size;
          break;
        }
      } catch {
        /* try the next candidate */
      }
    }

    if (!resolved) {
      const tried = candidates.length > 0 ? ` Tried: ${candidates.join(', ')}` : '';
      return textResult(
        `Image file not found: ${raw}.${tried} Provide an absolute path, a workspace-relative path, or a file:// URI.`,
      );
    }

    if (size > VISION_IMAGE_MAX_RAW_BYTES) {
      return textResult(
        `Image is too large to send (${Math.round(size / (1024 * 1024))} MiB; the limit is ${Math.round(VISION_IMAGE_MAX_RAW_BYTES / (1024 * 1024))} MiB).`,
      );
    }

    if (token.isCancellationRequested) throw new vscode.CancellationError();

    const bytes = await fs.readFile(resolved);
    logger.info(`[tool] viewImage read ${resolved} (${mime}, ${size} bytes)`);

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Image ${path.basename(resolved)} (${mime}):`),
      vscode.LanguageModelDataPart.image(new Uint8Array(bytes), mime),
    ]);
  }

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ViewImageInput>,
  ): vscode.PreparedToolInvocation {
    const name = options.input?.path ? path.basename(options.input.path) : '';
    return { invocationMessage: vscode.l10n.t('Reading image {0}', name) };
  }
}

export function registerViewImageTool(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.lm.registerTool(VIEW_IMAGE_TOOL_NAME, new ViewImageTool()));
}
