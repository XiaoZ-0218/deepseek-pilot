import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type vscode from 'vscode';
import mock from './vscode-mock';
import { ViewImageTool } from '../src/tools/view-image';
import { VISION_IMAGE_MAX_RAW_BYTES } from '../src/consts';

const { LanguageModelDataPart, LanguageModelTextPart } = mock;

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const token = { isCancellationRequested: false } as vscode.CancellationToken;

function invokeOptions(p: string): vscode.LanguageModelToolInvocationOptions<{ path: string }> {
  return { input: { path: p }, toolInvocationToken: undefined };
}

let tmpDir: string;
let pngPath: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'deepseek-pilot-viewimage-'));
  pngPath = path.join(tmpDir, 'shot.png');
  await fs.writeFile(pngPath, PNG_BYTES);
  mock.workspace.workspaceFolders = [{ uri: { fsPath: tmpDir } }];
});

afterAll(async () => {
  mock.workspace.workspaceFolders = undefined;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('ViewImageTool', () => {
  const tool = new ViewImageTool();

  it('returns the image bytes as a data part for an absolute path', async () => {
    const result = await tool.invoke(invokeOptions(pngPath), token);

    expect(result.content).toHaveLength(2);
    const [label, image] = result.content as [
      InstanceType<typeof LanguageModelTextPart>,
      InstanceType<typeof LanguageModelDataPart>,
    ];
    expect(label.value).toContain('shot.png');
    expect(image.mimeType).toBe('image/png');
    expect(new Uint8Array(image.data)).toEqual(PNG_BYTES);
  });

  it('resolves a workspace-relative path', async () => {
    const result = await tool.invoke(invokeOptions('shot.png'), token);
    const image = result.content[1] as InstanceType<typeof LanguageModelDataPart>;
    expect(image.mimeType).toBe('image/png');
  });

  it('resolves a file:// URI', async () => {
    const result = await tool.invoke(invokeOptions(pathToFileURL(pngPath).href), token);
    const image = result.content[1] as InstanceType<typeof LanguageModelDataPart>;
    expect(image.mimeType).toBe('image/png');
  });

  it('maps the extension to the right mime type', async () => {
    const jpgPath = path.join(tmpDir, 'photo.JPG');
    await fs.writeFile(jpgPath, PNG_BYTES);
    const result = await tool.invoke(invokeOptions(jpgPath), token);
    const image = result.content[1] as InstanceType<typeof LanguageModelDataPart>;
    expect(image.mimeType).toBe('image/jpeg');
  });

  it('returns a text explanation for a missing file', async () => {
    const result = await tool.invoke(invokeOptions(path.join(tmpDir, 'missing.png')), token);
    expect(result.content).toHaveLength(1);
    const text = result.content[0] as InstanceType<typeof LanguageModelTextPart>;
    expect(text.value).toContain('not found');
  });

  it('rejects unsupported extensions with a list of supported ones', async () => {
    const result = await tool.invoke(invokeOptions(path.join(tmpDir, 'notes.txt')), token);
    const text = result.content[0] as InstanceType<typeof LanguageModelTextPart>;
    expect(text.value).toContain('Unsupported image type');
    expect(text.value).toContain('.png');
  });

  it('refuses an image over the DeepSeek size cap without reading it', async () => {
    const bigPath = path.join(tmpDir, 'huge.png');
    const handle = await fs.open(bigPath, 'w');
    await handle.truncate(VISION_IMAGE_MAX_RAW_BYTES + 1);
    await handle.close();

    const result = await tool.invoke(invokeOptions(bigPath), token);
    const text = result.content[0] as InstanceType<typeof LanguageModelTextPart>;
    expect(text.value).toContain('too large');
  });

  it('handles an empty path input', async () => {
    const result = await tool.invoke(invokeOptions('  '), token);
    const text = result.content[0] as InstanceType<typeof LanguageModelTextPart>;
    expect(text.value).toContain('No image path provided');
  });

  it('names the file in the progress message', () => {
    const prepared = tool.prepareInvocation({ input: { path: pngPath } });
    expect(prepared.invocationMessage).toBe('Reading image shot.png');
  });
});
