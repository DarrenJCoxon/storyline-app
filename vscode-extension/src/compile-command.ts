import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';

// Shell out to the CLI: `nw compile --format <format>`. Does NOT
// reimplement the compile pipeline — that logic stays in the CLI so
// it's testable outside VS Code and usable from any terminal.
//
// UX flow (same for all formats):
//   1. Verify workspace has .novel-writer/state.json
//   2. Show a blocking progress toast
//   3. Stream stdout + stderr into the "Novel Writer" output channel
//   4. On success: notification with [Reveal in Finder] + [Open] actions
//   5. On failure: error notification with [View Log] action

interface CompileConfig {
  format: 'epub' | 'print-pdf';
  formatLabel: string;        // e.g. "EPUB" or "Print PDF"
  outputExtension: string;    // e.g. ".epub" or ".pdf"
  hint?: string;              // optional "may take up to a minute" etc.
}

const EPUB: CompileConfig = {
  format: 'epub',
  formatLabel: 'EPUB',
  outputExtension: '.epub',
};

const PRINT_PDF: CompileConfig = {
  format: 'print-pdf',
  formatLabel: 'Print PDF',
  outputExtension: '.pdf',
  hint: 'may take 10-30 seconds (Puppeteer + Paged.js)',
};

export async function compileToEpub(): Promise<void> {
  return runCompileCommand(EPUB);
}

export async function compileToPrintPdf(): Promise<void> {
  return runCompileCommand(PRINT_PDF);
}

// ── shared machinery ────────────────────────────────────────────

let outputChannel: vscode.OutputChannel | undefined;

async function runCompileCommand(config: CompileConfig): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage('Novel Writer: open a novel project folder first.');
    return;
  }

  const stateFile = vscode.Uri.joinPath(folder.uri, '.novel-writer', 'state.json');
  try {
    await vscode.workspace.fs.stat(stateFile);
  } catch {
    vscode.window.showErrorMessage(
      'Novel Writer: no .novel-writer/state.json found in this workspace. ' +
        'Run `nw init` in the terminal first.',
    );
    return;
  }

  const out = getOutputChannel();
  out.clear();
  out.show(true); // preserveFocus so the toast stays visible

  try {
    const outputPath = await runCompile(folder.uri.fsPath, out, config);
    await showSuccess(outputPath, config);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const choice = await vscode.window.showErrorMessage(
      `Novel Writer: compile failed — ${message}`,
      'View Log',
    );
    if (choice === 'View Log') {
      out.show();
    }
  }
}

function runCompile(
  cwd: string,
  out: vscode.OutputChannel,
  config: CompileConfig,
): Promise<string | null> {
  const title = config.hint
    ? `Compiling your novel to ${config.formatLabel}… (${config.hint})`
    : `Compiling your novel to ${config.formatLabel}…`;

  return new Promise((resolve, reject) => {
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false,
      },
      () =>
        new Promise<void>((progressResolve, progressReject) => {
          // Use `shell: true` so the user's PATH/aliases are respected
          // (VS Code on macOS doesn't always inherit the shell profile's
          // PATH when launched from the GUI). The command is hardcoded,
          // not user-supplied, so there's no shell-injection concern.
          const child = spawn(`nw compile --format ${config.format}`, {
            cwd,
            shell: true,
            env: { ...process.env, FORCE_COLOR: '0' },
          });

          let stdoutBuf = '';

          child.stdout?.on('data', (chunk: Buffer) => {
            const text = chunk.toString();
            stdoutBuf += text;
            out.append(text);
          });

          child.stderr?.on('data', (chunk: Buffer) => {
            out.append(chunk.toString());
          });

          child.on('error', err => {
            const msg = (err as NodeJS.ErrnoException).code === 'ENOENT'
              ? '`nw` command not found on PATH. Install the novel-writer CLI and link it: ' +
                '`cd /path/to/novel-writer && npm link`'
              : err.message;
            out.appendLine(`\nError: ${msg}`);
            progressReject(new Error(msg));
            reject(new Error(msg));
          });

          child.on('close', code => {
            if (code === 0) {
              // The CLI prints "Output: /abs/path/to/file.<ext>" on success.
              const extForRegex = config.outputExtension.replace('.', '\\.');
              const match = stdoutBuf.match(new RegExp(`Output:\\s*(\\S+${extForRegex})`));
              const outputPath = match ? match[1].trim() : null;
              progressResolve();
              resolve(outputPath);
            } else {
              // Try to surface the most relevant error line from stdout.
              const lastFailLine = stdoutBuf
                .split('\n')
                .reverse()
                .find(l => /(✗|error|failed)/i.test(l));
              const err = new Error(
                lastFailLine ? lastFailLine.replace(/^\s+|\s+$/g, '').replace(/\u2717/g, '') : `Exited with code ${code}`,
              );
              progressReject(err);
              reject(err);
            }
          });
        }),
    );
  });
}

async function showSuccess(outputPath: string | null, config: CompileConfig): Promise<void> {
  if (!outputPath) {
    vscode.window.showInformationMessage(`Novel Writer: ${config.formatLabel} compile complete.`);
    return;
  }

  const uri = vscode.Uri.file(outputPath);
  const filename = path.basename(outputPath);
  const choice = await vscode.window.showInformationMessage(
    `✓ Compiled ${filename}`,
    'Reveal in Finder',
    'Open',
  );

  if (choice === 'Reveal in Finder') {
    await vscode.commands.executeCommand('revealFileInOS', uri);
  } else if (choice === 'Open') {
    // EPUB and PDF aren't rendered usefully in VS Code; hand off to the OS
    // (Books.app for EPUB on macOS, Preview.app for PDF, etc.).
    await vscode.env.openExternal(uri);
  }
}

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Novel Writer');
  }
  return outputChannel;
}
