import { db } from './db.js';
import { htmlToText } from './activity.js';

// Full-text index behind Search. One row per entry (rowid = the entry's id),
// holding the entry's plain text and its tag names. Whole-word matching with
// word-start (prefix) matching, accents and case ignored. The entries table is
// the source of truth: this index can always be rebuilt from it.
//
// Every place that creates, changes or deletes an entry, or renames/deletes a
// tag, calls the functions here so Search is current straight away.

const INDEX_VERSION = '1';

export let SEARCH_AVAILABLE = true;
try {
  db.exec(
    "CREATE VIRTUAL TABLE IF NOT EXISTS entry_search USING fts5(text, tags, tokenize='unicode61 remove_diacritics 2', prefix='2 3 4')"
  );
} catch (err) {
  SEARCH_AVAILABLE = false;
  console.error(`ERROR: full-text search is unavailable (${err.message}). Search is turned off.`);
}

// `visible` is true only for the first build after an upgrade, when searches
// may be missing entries. Later start-up refreshes are silent: the existing
// index keeps working while they run.
const progress = { building: false, visible: false, done: 0, total: 0 };
export function indexStatus() {
  return progress.building && progress.visible ? { done: progress.done, total: progress.total } : null;
}

const tagNames = (id) =>
  db
    .prepare('SELECT tags.name FROM tags JOIN entry_tags ON entry_tags.tag_id = tags.id WHERE entry_tags.entry_id = ?')
    .all(id)
    .map((t) => t.name)
    .join(' ');

// Writes (or rewrites) one entry's row. Safe to call again for the same entry.
export function indexEntry(id) {
  if (!SEARCH_AVAILABLE) return;
  try {
    const entry = db.prepare('SELECT id, body FROM entries WHERE id = ?').get(id);
    db.prepare('DELETE FROM entry_search WHERE rowid = ?').run(id);
    if (!entry) return;
    db.prepare('INSERT INTO entry_search (rowid, text, tags) VALUES (?, ?, ?)').run(
      entry.id,
      htmlToText(entry.body, Infinity),
      tagNames(entry.id)
    );
  } catch (err) {
    // A problem with the index must never stop an entry from being saved.
    console.error(`search index: could not index entry ${id}: ${err.message}`);
  }
}

export function removeFromIndex(id) {
  if (!SEARCH_AVAILABLE) return;
  try {
    db.prepare('DELETE FROM entry_search WHERE rowid = ?').run(id);
  } catch (err) {
    console.error(`search index: could not remove entry ${id}: ${err.message}`);
  }
}

// The entries that carry a tag (call before deleting the tag, then reindex them after).
export const entryIdsWithTag = (tagId) =>
  db.prepare('SELECT entry_id FROM entry_tags WHERE tag_id = ?').all(tagId).map((r) => r.entry_id);

export function reindexEntries(ids) {
  for (const id of ids) indexEntry(id);
}

// Builds the index on the first start after an upgrade, and refreshes it on
// every later start, so it can never drift from the entries (for example after
// rolling back to an older version and upgrading again). It works in small
// batches and yields between them, so the server starts and answers requests
// straight away. The first build says Search is still getting ready; refreshes
// are silent because the existing index keeps working meanwhile.
export function startIndexBuild() {
  if (!SEARCH_AVAILABLE) return;
  const done = db.prepare("SELECT value FROM app_meta WHERE key = 'search_index_version'").get();
  const first = !(done && done.value === INDEX_VERSION);

  if (first) db.prepare('DELETE FROM entry_search').run();
  progress.visible = first;
  progress.building = true;
  progress.done = 0;
  progress.total = db.prepare('SELECT COUNT(*) AS n FROM entries').get().n;
  let lastId = 0;
  const BATCH = 300;

  const step = () => {
    try {
      const rows = db.prepare('SELECT id FROM entries WHERE id > ? ORDER BY id LIMIT ?').all(lastId, BATCH);
      if (rows.length === 0) {
        // Rows for entries that no longer exist (deleted while another version ran).
        db.prepare('DELETE FROM entry_search WHERE rowid NOT IN (SELECT id FROM entries)').run();
        db.prepare("INSERT INTO app_meta (key, value) VALUES ('search_index_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
          INDEX_VERSION
        );
        progress.building = false;
        console.log(`search index built (${progress.done} entries)`);
        return;
      }
      db.transaction(() => rows.forEach((r) => indexEntry(r.id)))();
      lastId = rows[rows.length - 1].id;
      progress.done += rows.length;
    } catch (err) {
      console.error(`search index build failed: ${err.message}`);
      progress.building = false;
      return;
    }
    setImmediate(step);
  };
  setImmediate(step);
}
