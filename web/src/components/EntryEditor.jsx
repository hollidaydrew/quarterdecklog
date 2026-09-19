import { useEffect, useId, useRef, useState } from 'react';
import 'trix';
import 'trix/dist/trix.css';
import TagChip from './TagChip.jsx';

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Trix (https://github.com/basecamp/trix) keeps the entry's HTML in a hidden
// input, so saving just reads that input. The input, toolbar and editor are
// created once as plain markup that React never re-renders: React would
// otherwise reset the hidden input's value on every re-render (for example
// when a tag is clicked) and wipe what was typed.
//
// Entries are text-only, so file attachments are switched off: the attach
// button is hidden with CSS and any dropped or pasted file is refused.
export default function EntryEditor({ initialBody = '', allTags, initialTagIds = [], onSave, onCancel, saving }) {
  const [selectedTagIds, setSelectedTagIds] = useState(new Set(initialTagIds));
  const uid = useId().replace(/:/g, '');
  const [markup] = useState(() => {
    const inputId = `entry-body-${uid}`;
    const toolbarId = `entry-toolbar-${uid}`;
    return (
      `<input id="${inputId}" type="hidden" value="${escapeAttr(initialBody)}">` +
      `<trix-toolbar id="${toolbarId}"></trix-toolbar>` +
      `<trix-editor input="${inputId}" toolbar="${toolbarId}" placeholder="Write an entry…"></trix-editor>`
    );
  });
  const hostRef = useRef(null);

  useEffect(() => {
    const el = hostRef.current && hostRef.current.querySelector('trix-editor');
    if (!el) return undefined;
    const refuseFiles = (e) => e.preventDefault();
    el.addEventListener('trix-file-accept', refuseFiles);
    const focusEditor = () => el.focus();
    if (el.editor) focusEditor();
    else el.addEventListener('trix-initialize', focusEditor, { once: true });
    return () => {
      el.removeEventListener('trix-file-accept', refuseFiles);
      el.removeEventListener('trix-initialize', focusEditor);
    };
  }, []);

  const toggleTag = (id) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    const el = hostRef.current && hostRef.current.querySelector('trix-editor');
    const input = hostRef.current && hostRef.current.querySelector('input[type="hidden"]');
    if (!el || !el.editor || !input) return;
    if (el.editor.getDocument().toString().trim() === '') return;
    onSave({ body: input.value, tag_ids: Array.from(selectedTagIds) });
  };

  return (
    <div className="entry-editor">
      <div ref={hostRef} dangerouslySetInnerHTML={{ __html: markup }} />

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
