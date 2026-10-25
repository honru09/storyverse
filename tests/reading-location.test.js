import { test } from 'node:test';
import assert from 'node:assert/strict';
import { READING_LOCATION_KEY, chapterLocationKey, normalizeAnchor, findInChapters, createReadingLocationStore } from '../src/reading-location.js';
const memory = () => { const data = new Map(); return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };
test('chapter identity separates branches, chapters, books and snapshots', () => {
  const key = chapterLocationKey('book', 0, ['你好']);
  assert.equal(key, chapterLocationKey('book', 0, ['你好']));
  for (const other of [chapterLocationKey('book', 0, ['重写']), chapterLocationKey('book', 1, ['你好']), chapterLocationKey('other', 0, ['你好']), chapterLocationKey('book', 0, ['你好'], true)]) assert.notEqual(key, other);
});
test('anchors reject malformed values and clamp valid numbers', () => {
  for (const value of [null, [], { paragraph: -1, offset: 0 }, { paragraph: '1', offset: 0 }, { paragraph: 0, offset: Infinity }]) assert.equal(normalizeAnchor(value), null);
  assert.deepEqual(normalizeAnchor({ paragraph: 99, offset: 5 }, 3), { paragraph: 2, offset: 1 });
  assert.equal(normalizeAnchor({ paragraph: 0, offset: 0 }, 0), null);
});
test('locations persist independently without touching story data', () => {
  const storage = memory(); storage.setItem('storyweave:v2', 'UNCHANGED');
  const store = createReadingLocationStore({ storage });
  store.set('a', { paragraph: 2, offset: .4 });
  assert.deepEqual(createReadingLocationStore({ storage }).get('a'), { paragraph: 2, offset: .4 });
  assert.equal(storage.getItem('storyweave:v2'), 'UNCHANGED');
});
test('stored locations are bounded by recent chapters', () => {
  const storage = memory(); const store = createReadingLocationStore({ storage });
  for (let i = 0; i < 110; i++) store.set(String(i), { paragraph: 0, offset: 0 });
  assert.equal(JSON.parse(storage.getItem(READING_LOCATION_KEY)).locations.length, 100);
  assert.equal(store.get('0'), null);
});
test('storage failures preserve in-memory position and explain failure', () => {
  const store = createReadingLocationStore({ storage: { getItem: () => null, setItem: () => { throw new Error('denied'); } } });
  assert.match(store.set('a', { paragraph: 1, offset: .3 }), /暂时无法保存/);
  assert.deepEqual(store.get('a'), { paragraph: 1, offset: .3 });
});
test('corrupt location storage does not block a reader', () => {
  const store = createReadingLocationStore({ storage: { getItem: () => '{' } });
  assert.equal(store.get('a'), null); assert.match(store.warning(), /无法读取/);
});
test('bookmarks toggle per paragraph and filter inaccessible rewritten keys', () => {
  const store = createReadingLocationStore({ storage: memory() });
  const entry = { key: 'old', storyId: 'book', chapterIndex: 0, anchor: { paragraph: 2, offset: .5 }, title: '第一章', excerpt: '海风' };
  assert.equal(store.toggleBookmark(entry), true);
  assert.equal(store.bookmarks('other').length, 0);
  assert.equal(store.bookmarks('book', ['new']).length, 0);
  assert.equal(store.bookmarks('book', ['old']).length, 1);
  assert.equal(store.toggleBookmark(entry), false);
  assert.equal(store.bookmarks('book').length, 0);
});
test('bookmarks can be removed without changing positions', () => {
  const store = createReadingLocationStore({ storage: memory() });
  const anchor = { paragraph: 0, offset: 0 };
  store.set('a', anchor);
  store.toggleBookmark({ key: 'a', storyId: 'b', chapterIndex: 0, anchor, title: '章', excerpt: '文' });
  store.removeBookmark('a', 0);
  assert.equal(store.bookmarks('b').length, 0); assert.deepEqual(store.get('a'), anchor);
});
test('search never reveals locked chapters and returns literal text', () => {
  const chapters = [{ title: '一', paragraphs: ['风吹过 <script>Forest</script>', '风又起'] }, { title: '二', paragraphs: ['风秘密'] }];
  assert.equal(findInChapters(chapters, '风', 0).length, 2);
  assert.equal(findInChapters(chapters, 'FOREST', 0)[0].paragraph, 0);
  assert.equal(findInChapters(chapters, '   ', 1).length, 0);
  assert.equal(findInChapters(chapters, '秘密', 0).length, 0);
});
test('search caps results and tolerates a not-yet-generated chapter', () => {
  assert.equal(findInChapters([null, { title: '一', paragraphs: Array(90).fill('风') }], '风').length, 60);
});
test('interleaved readers preserve new bookmarks and never resurrect deletions', () => {
  const storage = memory();
  const first = createReadingLocationStore({ storage });
  const second = createReadingLocationStore({ storage });
  const anchor = { paragraph: 0, offset: 0 };
  first.toggleBookmark({ key: 'a', storyId: 'book', chapterIndex: 0, anchor, title: '章', excerpt: '文' });
  second.set('b', anchor);
  assert.equal(createReadingLocationStore({ storage }).bookmarks('book').length, 1);
  second.removeBookmark('a', 0);
  first.set('a', anchor);
  assert.equal(createReadingLocationStore({ storage }).bookmarks('book').length, 0);
  assert.deepEqual(first.get('b'), anchor);
});
test('unreadable saved location data is retained, not overwritten during scrolling', () => {
  const storage = memory(); storage.setItem(READING_LOCATION_KEY, '{broken');
  const store = createReadingLocationStore({ storage });
  store.set('a', { paragraph: 1, offset: 0 });
  assert.equal(storage.getItem(READING_LOCATION_KEY), '{broken');
});
