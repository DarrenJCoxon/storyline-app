import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rm, mkdir, readFile } from 'fs/promises';
import path from 'path';
import os from 'os';

// We test the push module's contract-level behaviour: it should shell out
// to odd-flow, advance the cursor for successful entries, and degrade
// gracefully on failure. We stub execFile so tests don't depend on a real
// odd-flow install and run fast.

describe('pushEntriesToOddFlow — behaviour under mocked child_process', () => {
  let tmp;
  let execFileMock;
  let pushEntriesToOddFlow;

  beforeEach(async () => {
    tmp = await import('fs').then(fs => fs.mkdtempSync(path.join(os.tmpdir(), 'storyline-of-push-')));
    await mkdir(path.join(tmp, '.storyline'), { recursive: true });

    // Reset module registry so we can stub child_process per-test.
    vi.resetModules();

    execFileMock = vi.fn();
    vi.doMock('child_process', () => ({
      execFile: (cmd, args, opts, cb) => {
        const result = execFileMock(cmd, args, opts);
        const err = result.ok ? null : Object.assign(new Error('odd-flow failed'), {
          code: result.code ?? 1,
          stdout: result.stdout ?? '',
          stderr: result.stderr ?? '',
        });
        cb(err, result.stdout ?? '', result.stderr ?? '');
      },
    }));

    const mod = await import('../lib/memory/odd-flow-push.js?t=' + Date.now());
    pushEntriesToOddFlow = mod.pushEntriesToOddFlow;
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
    vi.resetAllMocks();
    vi.resetModules();
  });

  it('returns skipped=true and zero counts when given no entries', async () => {
    const r = await pushEntriesToOddFlow([], { cwd: tmp });
    expect(r.skipped).toBe(true);
    expect(r.pushed).toBe(0);
    expect(r.failed).toBe(0);
  });

  it('pushes each entry as a separate odd-flow memory store call', async () => {
    execFileMock.mockReturnValue({ ok: true, stdout: '[OK] stored', stderr: '' });
    const entries = [
      { id: 'e1', key: 'k1', value: 'v1', namespace: 'ns1', tags: ['a'] },
      { id: 'e2', key: 'k2', value: 'v2', namespace: 'ns2', tags: ['b', 'c'] },
    ];
    const r = await pushEntriesToOddFlow(entries, { cwd: tmp });
    expect(r.pushed).toBe(2);
    expect(r.failed).toBe(0);
    expect(execFileMock).toHaveBeenCalledTimes(2);
  });

  it('includes --tags flag joined with commas when tags are present', async () => {
    execFileMock.mockReturnValue({ ok: true, stdout: '', stderr: '' });
    await pushEntriesToOddFlow([
      { id: 'e1', key: 'k', value: 'v', namespace: 'n', tags: ['alpha', 'beta'] },
    ], { cwd: tmp });
    const args = execFileMock.mock.calls[0][1];
    const tagIdx = args.indexOf('--tags');
    expect(tagIdx).toBeGreaterThan(-1);
    expect(args[tagIdx + 1]).toBe('alpha,beta');
  });

  it('omits --tags when the entry has no tags', async () => {
    execFileMock.mockReturnValue({ ok: true, stdout: '', stderr: '' });
    await pushEntriesToOddFlow([{ id: 'e1', key: 'k', value: 'v', namespace: 'n' }], { cwd: tmp });
    const args = execFileMock.mock.calls[0][1];
    expect(args).not.toContain('--tags');
  });

  it('stringifies non-string values before passing to odd-flow', async () => {
    execFileMock.mockReturnValue({ ok: true, stdout: '', stderr: '' });
    await pushEntriesToOddFlow([
      { id: 'e1', key: 'k', value: { nested: 'obj' }, namespace: 'n' },
    ], { cwd: tmp });
    const args = execFileMock.mock.calls[0][1];
    const vIdx = args.indexOf('-v');
    expect(args[vIdx + 1]).toBe('{"nested":"obj"}');
  });

  it('counts partial failures correctly and only advances cursor for successes', async () => {
    execFileMock.mockImplementation((cmd, args) => {
      const key = args[args.indexOf('-k') + 1];
      return key === 'good'
        ? { ok: true, stdout: 'stored', stderr: '' }
        : { ok: false, stdout: '', stderr: 'some failure' };
    });
    const entries = [
      { id: 'e1', key: 'good', value: 'v', namespace: 'n' },
      { id: 'e2', key: 'bad',  value: 'v', namespace: 'n' },
      { id: 'e3', key: 'good', value: 'v', namespace: 'n' },
    ];
    const r = await pushEntriesToOddFlow(entries, { cwd: tmp });
    expect(r.pushed).toBe(2);
    expect(r.failed).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].key).toBe('bad');

    // Only e1 and e3 should be in the synced cursor under tmp/.storyline/.
    const synced = await readFile(path.join(tmp, '.storyline', 'memory.synced'), 'utf-8');
    expect(synced).toContain('e1');
    expect(synced).toContain('e3');
    expect(synced).not.toContain('e2');
  });

  it('auto-runs `memory init` when DB-not-initialised error is seen, then retries', async () => {
    let callCount = 0;
    execFileMock.mockImplementation((cmd, args) => {
      callCount++;
      if (args[0] === 'memory' && args[1] === 'init') {
        return { ok: true, stdout: 'initialised', stderr: '' };
      }
      if (callCount === 1) {
        return { ok: false, stdout: '', stderr: '[ERROR] Database not initialized. Run: odd-flow memory init' };
      }
      return { ok: true, stdout: 'stored', stderr: '' };
    });
    const r = await pushEntriesToOddFlow(
      [{ id: 'e1', key: 'k', value: 'v', namespace: 'n' }],
      { cwd: tmp },
    );
    expect(r.pushed).toBe(1);
    expect(r.failed).toBe(0);
    // Verify one of the calls was `memory init` — matches whether odd-flow
    // was invoked directly (args: ['memory', 'init', ...]) or via npx
    // (args: ['-y', 'odd-flow@latest', 'memory', 'init', ...]).
    const sawInit = execFileMock.mock.calls.some(c => {
      const args = c[1];
      const i = args.indexOf('memory');
      return i !== -1 && args[i + 1] === 'init';
    });
    expect(sawInit).toBe(true);
  });

  it('caps the errors array at 5 entries to avoid flooding the receipt', async () => {
    execFileMock.mockReturnValue({ ok: false, stdout: '', stderr: 'fail' });
    const entries = Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`, key: `k${i}`, value: 'v', namespace: 'n',
    }));
    const r = await pushEntriesToOddFlow(entries, { cwd: tmp });
    expect(r.failed).toBe(10);
    expect(r.errors).toHaveLength(5);
  });

  it('reports `cli` field so the receipt shows how odd-flow was invoked', async () => {
    execFileMock.mockReturnValue({ ok: true, stdout: '', stderr: '' });
    const r = await pushEntriesToOddFlow(
      [{ id: 'e1', key: 'k', value: 'v', namespace: 'n' }],
      { cwd: tmp },
    );
    // cli is either 'local' (odd-flow found in storyline-vsc's or project's
    // node_modules) or 'npx' (fallback). Just assert it's one of the two.
    expect(['local', 'npx']).toContain(r.cli);
  });
});
