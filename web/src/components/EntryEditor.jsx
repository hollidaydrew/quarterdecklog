import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TagChip from './TagChip.jsx';

function ToolbarButton({ onClick, active, children, title }) {
  return (
    <button type="button" title={title} className={active ? 'active' : ''} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  );
}

export default function EntryEditor({ initialBody = '', allTags, initialTagIds = [], onSave, onCancel, saving }) {
  const [selectedTagIds, setSelectedTagIds] = useState(new Set(initialTagIds));

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    content: initialBody,
    editorProps: {
      attributes: { class: 'ProseMirror' },
    },
  });

  useEffect(() => () => editor?.destroy(), [editor]);

  const toggleTag = (id) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    const html = editor.getHTML();
    if (editor.isEmpty) return;
    onSave({ body: html, tag_ids: Array.from(selectedTagIds) });
  };

  if (!editor) return null;

  return (
    <div>
      <div className="editor-toolbar">
        <ToolbarButton title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>B</ToolbarButton>
        <ToolbarButton title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><em>i</em></ToolbarButton>
        <ToolbarButton title="Underline strike" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>S</ToolbarButton>
        <ToolbarButton title="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</ToolbarButton>
        <ToolbarButton title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</ToolbarButton>
        <ToolbarButton title="Quote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>&ldquo;&rdquo;</ToolbarButton>
        <ToolbarButton title="Code" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>{'</>'}</ToolbarButton>
      </div>

      <EditorContent editor={editor} />

      {allTags.length > 0 && (
        <div className="tag-filter-row" style={{ marginTop: 16 }}>
          {allTags.map((tag) => (
            <TagChip key={tag.id} tag={tag} outline active={selectedTagIds.has(tag.id)} onClick={() => toggleTag(tag.id)} />
          ))}
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
        <button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save entry'}</button>
      </div>
    </div>
  );
}
