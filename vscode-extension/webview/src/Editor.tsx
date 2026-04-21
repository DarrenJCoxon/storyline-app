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

export function Editor(): JSX.Element | null {
  const [fileLoaded, setFileLoaded] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('No file open');

  // Guard refs — stable across re-renders so the TipTap onUpdate closure
  // can see current state without being re-created.
  const fileLoadedRef = useRef(false);
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
  });

  // Cmd/Ctrl+S — power-user "save right now" shortcut. Host cancels
  // the pending autosave timer and saves immediately.
  const saveNow = useMemo(() => () => {
    if (!editor) return;
    vscode.postMessage({ type: 'save', markdown: getMarkdown(editor) });
  }, [editor]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const msg = event.data as { type: string; markdown?: string; fileName?: string; error?: string };

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
