import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { Markdown } from 'tiptap-markdown';
import { SceneBreak } from './extensions/SceneBreak';
import { vscode } from './vscode';
import { debounce } from './debounce';

// Save model: autosave on idle (host debounces to ~1.5s after the last
// content-changed). The UI here is passive — no Save button. Cmd/Ctrl+S
// still triggers an immediate save for writers who want explicit control.
//
// Status indicator states, driven by host messages:
//   'saved'        — on disk, nothing pending
//   'pending'      — edits buffered, autosave scheduled (the webview
//                    inferred this from onUpdate; no host round-trip
//                    needed to light it up)
//   'saving'       — save is in flight
//   'failed:<msg>' — save attempt errored; VS Code native save still
//                    available as a fallback

type SaveStatus = 'saved' | 'pending' | 'saving' | 'failed';

type MarkdownStorage = { getMarkdown: () => string };

function getMarkdown(editor: { storage: { markdown?: MarkdownStorage } } | null | undefined): string {
  return editor?.storage.markdown?.getMarkdown() ?? '';
}

// Typewriter-mode preference is persisted via vscode.setState so it
// survives webview reloads. Default is ON for new writers — it's the
// distinguishing writing-surface feature — but easily turned off via
// the toolbar checkbox.
function readTypewriterPref(): boolean {
  try {
    const s = vscode.getState() as { typewriter?: boolean } | undefined;
    return s?.typewriter !== false;
  } catch { return true; }
}
function writeTypewriterPref(enabled: boolean): void {
  try {
    const s = (vscode.getState() as Record<string, unknown>) || {};
    vscode.setState({ ...s, typewriter: enabled });
  } catch { /* ignore */ }
}

// Compose mode is intentionally NOT persisted. It's an active gesture
// the writer takes to enter "flow" mode, and pairs with VS Code Zen
// Mode toggling on the host side. Restoring it across reloads risks
// the in-webview surface being in compose layout while VS Code's Zen
// state is off (they desync because Zen Mode has no isOn() API), so
// we always start fresh in normal mode and let the writer re-enter
// with Cmd/Ctrl+Shift+Enter.

// Roughly count words in a markdown string. Cheap enough to run on every
// onUpdate (debounced via the React render cycle), since compose mode
// shows it live in the bottom bar. Strips markdown syntax so common
// punctuation/asterisks don't inflate the count.
function countWords(markdown: string): number {
  if (!markdown) return 0;
  const stripped = markdown
    .replace(/```[\s\S]*?```/g, ' ')      // fenced code blocks
    .replace(/`[^`]*`/g, ' ')              // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')  // links — keep label text? simpler to drop
    .replace(/[#>*_~\-=]+/g, ' ')          // markdown punctuation
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped) return 0;
  return stripped.split(/\s+/).length;
}

export function Editor(): JSX.Element | null {
  const [fileLoaded, setFileLoaded] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('No file open');
  const [typewriter, setTypewriter] = useState<boolean>(() => readTypewriterPref());
  const [composeMode, setComposeMode] = useState<boolean>(false);
  const [wordCount, setWordCount] = useState<number>(0);
  const [role, setRole] = useState<'manuscript' | 'supporting' | null>(null);

  // Guard refs — stable across re-renders so the TipTap onUpdate closure
  // can see current state without being re-created.
  const fileLoadedRef = useRef(false);
  // Ref mirror of typewriter flag so the onSelectionUpdate closure
  // (captured once when useEditor mounts) sees the live value without
  // needing the editor to be re-created on toggle.
  const typewriterRef = useRef(typewriter);
  useEffect(() => { typewriterRef.current = typewriter; }, [typewriter]);
  // Last markdown the host acknowledged as "on disk" (initial load or
  // post-save). onUpdate compares against this before marking pending —
  // a no-op setContent echo from the host won't re-dirty the indicator.
  const lastSavedMarkdownRef = useRef<string>('');
  // Scroll-restore guard. When the host supplies an initial scroll Y on
  // load-content, we programmatically scrollTo that position after the
  // TipTap render settles. Our own scroll listener would otherwise fire
  // during that motion and post the mid-restore positions back to the
  // host, overwriting the saved value with whatever we happened to pass
  // through. This timestamp marks "ignore scroll events until".
  const suppressScrollUntilRef = useRef<number>(0);

  // Push to host on a tight 50ms debounce — essentially a throttle. The
  // previous 500ms was a silent data-loss window: the TextDocument only
  // becomes dirty after this message reaches the host, so if the writer
  // closed the project within 500ms of their last keystroke, VS Code had
  // no dirty buffer to prompt about and the content vanished. 50ms keeps
  // fast-typist burst coalescing while shrinking the loss window to a
  // single frame.
  const sendContentChange = useMemo(
    () => debounce((markdown: string) => {
      vscode.postMessage({ type: 'content-changed', markdown });
    }, 500),
    [],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ horizontalRule: false }),
      SceneBreak,
      Table.configure({ resizable: false, HTMLAttributes: { class: 'prose-table' } }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown.configure({
        html: false,
        tightLists: true,
        linkify: true,
        breaks: false,
        transformPastedText: true,
      }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
      if (!fileLoadedRef.current) return;
      const md = getMarkdown(editor);
      // Live word count for the compose-mode bottom bar. Cheap regex
      // strip, run on every update — no debounce, since React batches
      // renders and the count rarely changes more than ±1 per keystroke.
      setWordCount(countWords(md));
      // Ignore spurious updates that match the last-saved content
      // (happens when the host echoes load-content, or TipTap normalises
      // whitespace on parse).
      if (md === lastSavedMarkdownRef.current) return;
      setStatus('pending');
      setSaveError(null);
      sendContentChange(md);
    },
    // Typewriter scroll — keep the caret near the vertical middle of
    // the viewport so the writer never types at the screen edge.
    // Scrivener / Ulysses / iA Writer all ship this by default.
    //
    // Two restraints on when this fires, both added after the first
    // pass was too aggressive:
    //
    //   1. Only when the selection is EMPTY (a caret, not a range).
    //      Without this, click-and-drag to select text scrolls the
    //      viewport on every mouse-move event, grabbing huge amounts
    //      of text the writer didn't mean to select.
    //
    //   2. Only when the caret is NEAR a viewport edge (outside the
    //      25%–70% dead-zone). Without this, every keystroke triggers
    //      a pixel-scale scroll that feels jittery. A dead-zone in the
    //      middle lets the prose settle visually while still pulling
    //      the caret back when it drifts toward the edges.
    onSelectionUpdate: ({ editor }) => {
      if (!typewriterRef.current) return;  // feature toggled off
      const sel = editor.state.selection;
      if (!sel.empty) return;  // user is selecting a range — don't move the view
      const { from } = sel;
      requestAnimationFrame(() => {
        try {
          const coords = editor.view.coordsAtPos(from);
          const target = window.innerHeight * 0.45;
          const delta = coords.top - target;
          // Absolute-pixel tolerance rather than a percentage band —
          // 48px ≈ 1-2 lines at our default font size, so typewriter
          // kicks in cleanly after each line break and stays calm
          // within the current line. A percentage band scaled badly
          // on tall displays (could be hundreds of pixels wide,
          // defeating the feature).
          if (Math.abs(delta) < 48) return;
          window.scrollBy({ top: delta, behavior: 'instant' as ScrollBehavior });
        } catch {
          // coordsAtPos can throw transiently during setContent; ignore.
        }
      });
    },
  });

  // Cmd/Ctrl+S — power-user "save right now" shortcut. Host cancels
  // the pending autosave timer and saves immediately.
  const saveNow = useMemo(() => () => {
    if (!editor) return;
    vscode.postMessage({ type: 'save', markdown: getMarkdown(editor) });
  }, [editor]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const msg = event.data as {
        type: string;
        markdown?: string;
        fileName?: string;
        error?: string;
        role?: string;
        restoreScrollY?: number | null;
      };

      if (msg.type === 'load-content' && editor && typeof msg.markdown === 'string') {
        // Skip the re-apply if the editor already has this exact content.
        // Prevents TipTap firing onUpdate in response to a no-op setContent,
        // which used to flip the status back to 'pending' after a save.
        if (getMarkdown(editor) !== msg.markdown) {
          editor.commands.setContent(msg.markdown);
        }
        if (msg.fileName) setFileName(msg.fileName);
        setFileLoaded(true);
        fileLoadedRef.current = true;
        lastSavedMarkdownRef.current = msg.markdown;
        // Seed the bottom-bar word count from initial content so compose
        // mode shows a real number before the writer types anything.
        setWordCount(countWords(msg.markdown));
        setStatus('saved');
        setSaveError(null);
        // Restore scroll after TipTap finishes laying out. Double rAF is
        // the minimum reliable delay — the first rAF runs right after
        // setContent flushes into the DOM, the second gives ProseMirror's
        // own post-render (any onSelectionUpdate clamping, typewriter
        // scroll on an initial caret at the end of a newly-loaded doc)
        // a chance to fire so our scrollTo wins the race.
        if (typeof msg.restoreScrollY === 'number' && msg.restoreScrollY > 0) {
          const target = msg.restoreScrollY;
          suppressScrollUntilRef.current = Date.now() + 600;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
              window.scrollTo({ top: Math.min(target, maxY), behavior: 'instant' as ScrollBehavior });
            });
          });
        }
      }
      if (msg.type === 'editor-role' && typeof msg.role === 'string') {
        // Apply the role class to BOTH documentElement (html) AND body.
        // Targeting only body and expecting CSS `body.nw-manuscript html`
        // to also pick up the html element was invalid — html is the
        // parent of body, not a descendant — which is why earlier
        // tints cut off mid-pane. Setting the class directly on html
        // lets CSS address both levels cleanly.
        document.documentElement.classList.remove('nw-manuscript', 'nw-supporting');
        document.body.classList.remove('nw-manuscript', 'nw-supporting');
        const cls = msg.role === 'manuscript' ? 'nw-manuscript' : 'nw-supporting';
        document.documentElement.classList.add(cls);
        document.body.classList.add(cls);
        setRole(msg.role === 'manuscript' ? 'manuscript' : 'supporting');
      }
      if (msg.type === 'saving') {
        setStatus('saving');
      }
      if (msg.type === 'saved' && editor) {
        lastSavedMarkdownRef.current = getMarkdown(editor);
        setStatus('saved');
        setSaveError(null);
      }
      if (msg.type === 'save-failed') {
        setStatus('failed');
        setSaveError(typeof msg.error === 'string' ? msg.error : 'save failed');
      }
      if (msg.type === 'request-compose-toggle') {
        // Host received the Cmd+Shift+Enter keybinding (VS Code consumes
        // it before our window keydown can see it) and is asking us to
        // flip compose mode locally. Our toggleCompose then echoes back
        // a `compose-mode` message which the host uses to fire Zen Mode
        // — symmetric round-trip so both layers stay in sync.
        toggleComposeRef.current?.();
      }
      if (msg.type === 'request-flush' && editor) {
        // Host is shutting down (deactivate) and wants the latest
        // markdown NOW, bypassing the 500ms debounce. Post
        // content-changed synchronously — host will applyEdit and save
        // before the extension process dies.
        const md = getMarkdown(editor);
        vscode.postMessage({ type: 'content-changed', markdown: md });
      }
    };
    window.addEventListener('message', listener);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', listener);
  }, [editor]);

  // Toggle compose mode locally AND tell the host so it can flip Zen
  // Mode in parallel — the two together produce the Scrivener-style
  // "vanish all UI" effect.
  const toggleCompose = useMemo(() => (next?: boolean) => {
    setComposeMode(prev => {
      const value = typeof next === 'boolean' ? next : !prev;
      vscode.postMessage({ type: 'compose-mode', enabled: value });
      return value;
    });
  }, []);
  // Mirror toggleCompose into a ref so the message-listener effect can
  // call it without taking it as a dependency (which would re-attach
  // the listener on every render and lose mid-flight messages).
  const toggleComposeRef = useRef(toggleCompose);
  useEffect(() => { toggleComposeRef.current = toggleCompose; }, [toggleCompose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Cmd/Ctrl+S — explicit save.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveNow();
        return;
      }
      // Compose-mode toggle is bound at the host level as the chord
      // Cmd+K Cmd+M (mac) / Ctrl+K Ctrl+M (win/linux) — chords can't be
      // intercepted reliably from inside the webview, so we leave the
      // shortcut to VS Code's keybinding system. The host's command
      // handler posts a `request-compose-toggle` message which our
      // listener below picks up. The original Cmd+Shift+Enter binding
      // was retired because it collided with Scrivener's own global
      // shortcut on macOS.
      // Esc exits compose mode (only). In normal mode Esc is left alone
      // so existing TipTap behaviours (close menus, blur) keep working.
      if (e.key === 'Escape' && composeMode) {
        e.preventDefault();
        toggleCompose(false);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow, toggleCompose, composeMode]);

  // Apply the compose-mode class to documentElement + body so the dark
  // gutter background and slim bottom bar stylesheet rules can target
  // both levels (mirrors the role-class application above).
  useEffect(() => {
    const cls = 'compose-mode';
    if (composeMode) {
      document.documentElement.classList.add(cls);
      document.body.classList.add(cls);
    } else {
      document.documentElement.classList.remove(cls);
      document.body.classList.remove(cls);
    }
  }, [composeMode]);

  // Scroll-position persistence. Debounced 400ms — a long planning doc
  // the writer is skimming fires dozens of scroll events per second;
  // posting each one would flood the host's workspaceState writes.
  // Suppressed during programmatic restore (see load-content handler).
  useEffect(() => {
    const postScroll = debounce(() => {
      if (Date.now() < suppressScrollUntilRef.current) return;
      if (!fileLoadedRef.current) return;
      vscode.postMessage({ type: 'scroll-changed', scrollY: window.scrollY });
    }, 400);
    window.addEventListener('scroll', postScroll, { passive: true });
    return () => window.removeEventListener('scroll', postScroll);
  }, []);

  // Flush-on-close safety net — covers the data-loss case where the
  // writer closes the tab while content is sitting in the debounce
  // window (typed, not yet posted to host). On any of the three events
  // that signal "this webview is about to lose state", push the current
  // markdown to the host with a `flush-save` message. The host applies
  // it and saves synchronously. Nothing else in the save pipeline
  // changes — this only ADDS a pre-close sync path.
  useEffect(() => {
    const flush = () => {
      if (!editor || !fileLoadedRef.current) return;
      const md = getMarkdown(editor);
      if (md === lastSavedMarkdownRef.current) return;
      vscode.postMessage({ type: 'flush-save', markdown: md });
    };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    // blur is intentionally NOT included here. In a VS Code webview, blur
    // fires on every toolbar-button click (Bold, Italic, etc.) because
    // the mousedown briefly pulls focus from the contenteditable. Adding
    // blur caused flush-save to race with in-flight applyEdit calls,
    // locking document.save() indefinitely ("Saving…" forever).
    // beforeunload + pagehide + visibilitychange cover the real close
    // paths without triggering during normal editing.
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [editor]);

  if (!editor) return null;

  const btn = (active: boolean) => ({ className: `toolbar-btn${active ? ' active' : ''}` });

  const statusLabel = (() => {
    if (!fileLoaded) return '';
    switch (status) {
      case 'saving':  return 'Saving\u2026';
      // Pending content is covered by the deactivate-time flushAll(),
      // so it cannot be lost even if the writer quits while in this
      // state — "Saved" is accurate. The old "Saving..." label lit up
      // continuously during fluid typing because autosave only fires
      // after a ~2s pause and fluid writers rarely stop that long.
      case 'pending': return 'Saved';
      case 'failed':  return 'Save failed';
      case 'saved':
      default:        return 'Saved';
    }
  })();

  return (
    <div className="novel-editor">
      <div className="toolbar">
        {role && (
          <span
            className={`nw-role-badge nw-role-badge--${role}`}
            title={
              role === 'manuscript'
                ? 'This file is part of the manuscript (prose you are writing).'
                : 'This is a supporting document (planning / reference material).'
            }
          >
            {role === 'manuscript' ? 'Manuscript' : 'Supporting'}
          </span>
        )}
        <button
          {...btn(editor.isActive('bold'))}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold (⌘B)"
        >
          B
        </button>
        <button
          {...btn(editor.isActive('italic'))}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic (⌘I)"
        >
          <em>I</em>
        </button>
        <span className="toolbar-divider" />
        <button
          {...btn(editor.isActive('heading', { level: 1 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Heading 1"
        >
          H1
        </button>
        <button
          {...btn(editor.isActive('heading', { level: 2 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        >
          H2
        </button>
        <span className="toolbar-divider" />
        <button
          {...btn(editor.isActive('bulletList'))}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
        >
          •
        </button>
        <button
          {...btn(editor.isActive('blockquote'))}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Blockquote"
        >
          ”
        </button>
        <button
          className="toolbar-btn toolbar-btn-scene-break"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Insert scene break"
        >
          * * *
        </button>
        <div className="toolbar-spacer" />
        <label
          className="toolbar-checkbox"
          title="Typewriter mode: keeps the current line near the middle of the viewport so you never type at the screen edge. Writers' feature — can be turned off if you prefer natural scroll."
        >
          <input
            type="checkbox"
            checked={typewriter}
            onChange={(e) => {
              const v = e.target.checked;
              setTypewriter(v);
              writeTypewriterPref(v);
            }}
          />
          <span>Typewriter</span>
        </label>
        <div className="toolbar-filename" title={fileName}>{fileName}</div>
        <div
          className={`toolbar-status toolbar-status--${status}`}
          title={saveError ? `Save error: ${saveError}` : 'Autosaves 1.5s after you stop typing. ⌘S to save now.'}
        >
          {statusLabel}
        </div>
      </div>
      <EditorContent editor={editor} />
      {composeMode && (
        <div className="compose-bar" role="toolbar" aria-label="Compose mode controls">
          <button
            className="compose-bar-btn"
            onClick={() => toggleCompose(false)}
            title="Exit compose mode (Esc)"
          >
            ◀ Exit
          </button>
          <span className="compose-bar-divider" />
          <label
            className="compose-bar-checkbox"
            title="Typewriter mode keeps the active line near the middle of the viewport."
          >
            <input
              type="checkbox"
              checked={typewriter}
              onChange={(e) => {
                const v = e.target.checked;
                setTypewriter(v);
                writeTypewriterPref(v);
              }}
            />
            <span>Typewriter</span>
          </label>
          <span className="compose-bar-divider" />
          <span className="compose-bar-filename" title={fileName}>{fileName}</span>
          <div className="compose-bar-spacer" />
          <span className="compose-bar-words">{wordCount.toLocaleString()} words</span>
          <span className="compose-bar-divider" />
          <span
            className={`compose-bar-status compose-bar-status--${status}`}
            title={saveError ? `Save error: ${saveError}` : 'Autosaves 1.5s after you stop typing. ⌘S to save now.'}
          >
            {statusLabel}
          </span>
        </div>
      )}
    </div>
  );
}
