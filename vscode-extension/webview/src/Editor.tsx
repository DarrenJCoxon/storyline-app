import React, { useEffect, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { vscode } from './vscode';
import { debounce } from './debounce';

const INITIAL_CONTENT = '<h1>Untitled Chapter</h1><p>Start writing. Formatting (bold, italic, headings) round-trips to markdown on save.</p>';

export function Editor(): JSX.Element | null {
  const sendContentChange = useMemo(
    () => debounce((content: unknown) => {
      vscode.postMessage({ type: 'content-changed', content });
    }, 500),
    [],
  );

  const editor = useEditor({
    extensions: [StarterKit],
    content: INITIAL_CONTENT,
    onUpdate: ({ editor }) => {
      sendContentChange(editor.getJSON());
    },
  });

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const msg = event.data as { type: string; content?: unknown };
      if (msg.type === 'set-content' && editor && msg.content) {
        editor.commands.setContent(msg.content as string);
      }
    };
    window.addEventListener('message', listener);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', listener);
  }, [editor]);

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
      </div>
      <EditorContent editor={editor} className="editor-surface" />
    </div>
  );
}
