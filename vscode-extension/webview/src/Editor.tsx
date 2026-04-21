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

export function Editor(): JSX.Element | null {
  const [fileLoaded, setFileLoaded] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('No file open');
  const [typewriter, setTypewriter] = useState<boolean>(() => readTypewriterPref());
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
      const msg = event.data as { type: string; markdown?: string; fileName?: string; error?: string; role?: string };

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
        setStatus('saved');
        setSaveError(null);
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
    };
    window.addEventListener('message', listener);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', listener);
  }, [editor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveNow();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow]);

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
      case 'pending': return 'Saving\u2026';   // writer sees "unsaved" as in-flight
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
    </div>
  );
}
