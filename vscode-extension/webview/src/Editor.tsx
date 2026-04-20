import React, { useEffect, useMemo, useState } from 'react';
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

type MarkdownStorage = { getMarkdown: () => string };

function getMarkdown(editor: { storage: { markdown?: MarkdownStorage } } | null | undefined): string {
  return editor?.storage.markdown?.getMarkdown() ?? '';
}

export function Editor(): JSX.Element | null {
  const [fileLoaded, setFileLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [fileName, setFileName] = useState<string>('No file open');

  const sendContentChange = useMemo(
    () => debounce((markdown: string) => {
      vscode.postMessage({ type: 'content-changed', markdown });
    }, 500),
    [],
  );

  const editor = useEditor({
    extensions: [
      // Disable StarterKit's default horizontal rule — we replace it with
      // our own SceneBreak node that renders '* * *' in both editor and output.
      StarterKit.configure({ horizontalRule: false }),
      SceneBreak,
      // GFM-style tables. markdown-it parses `| col | col |` + `|---|---|`
      // rows; tiptap-markdown serialises the TipTap table nodes back to
      // markdown on save. Non-resizable to keep the column widths stable
      // and CSS-controlled.
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
      if (!fileLoaded) return; // ignore the initial content set
      setDirty(true);
      sendContentChange(getMarkdown(editor));
    },
  });

  const save = useMemo(() => () => {
    if (!editor) return;
    vscode.postMessage({ type: 'save', markdown: getMarkdown(editor) });
    setDirty(false);
  }, [editor]);

  // Listen for messages from the extension host.
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const msg = event.data as { type: string; markdown?: string; fileName?: string };
      if (msg.type === 'load-content' && editor && typeof msg.markdown === 'string') {
        editor.commands.setContent(msg.markdown);
        if (msg.fileName) setFileName(msg.fileName);
        setFileLoaded(true);
        setDirty(false);
      }
      if (msg.type === 'saved') {
        setDirty(false);
      }
    };
    window.addEventListener('message', listener);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', listener);
  }, [editor]);

  // Cmd/Ctrl+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  if (!editor) return null;

  const btn = (active: boolean) => ({ className: `toolbar-btn${active ? ' active' : ''}` });

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
        <button
          className={`toolbar-save${dirty ? ' dirty' : ''}`}
          onClick={save}
          title="Save (⌘S)"
          disabled={!fileLoaded}
        >
          {dirty ? '● Save' : 'Saved'}
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
