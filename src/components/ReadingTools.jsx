import { useMemo, useState } from 'react';
import { estimateReadingMetrics, findInChapters } from '../reading-location.js';
import { storyNarrativeDossier } from '../story-engine.js';
import PixelfxCanvas from '../fx/PixelfxCanvas.jsx';
import { pickFx, PIXELFX_SCENE } from '../fx/placements.js';
import { useMotionSettings } from '../motion/MotionProvider.jsx';

export default function ReadingTools({
  chapters,
  lastAccessible,
  bookmarks,
  onSelect,
  onBookmark,
  onRemove,
  warning,
  story = null,
  currentChapterIndex = 0,
  storyBookmarked = false,
  onToggleStoryBookmark = undefined,
}) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('search');
  // PIXELFX-WAVE4 (§60): collecting the book earns one soft beat
  // inside the collect button — only on the way IN (uncollecting is
  // silent, like un-liking), and only under the house motion gate
  // (this component gates itself with the same predicate StoryCover
  // uses, since the reader's sheet mounts it directly).
  const fxSettings = useMotionSettings();
  const fxMotionOn =
    Boolean(fxSettings?.enabled) && !fxSettings?.reducedMotion && !fxSettings?.saveData;
  const [collectFx, setCollectFx] = useState(null);
  // BUGHUNT-20261102: a bookmark used to vanish on one bare tap with
  // no word afterwards — the same one-click-permanent pattern the
  // comment/post/rating deletes already grew out of.
  const [confirmingBookmarkKey, setConfirmingBookmarkKey] = useState('');
  const [bookmarkRemovedNote, setBookmarkRemovedNote] = useState('');
  // BUGHUNT-20261104: the position-bookmark call can now refuse (no
  // anchor captured yet) instead of silently landing at chapter start.
  const [positionBookmarkNote, setPositionBookmarkNote] = useState('');
  const bookmarkRowKey = item => `${item.key}-${item.anchor.paragraph}-${item.anchor.offset}`;
  const handleToggleStoryBookmark = () => {
    if (!storyBookmarked && fxMotionOn) {
      setCollectFx({ key: Date.now(), pick: pickFx(PIXELFX_SCENE.SHELF_COLLECT, null) });
    }
    onToggleStoryBookmark?.();
  };
  const { results, total, hasMore } = useMemo(() => findInChapters(chapters, query, lastAccessible), [chapters, query, lastAccessible]);
  const currentChapter = chapters?.[currentChapterIndex];
  const metrics = useMemo(() => estimateReadingMetrics(currentChapter?.paragraphs || []), [currentChapter]);
  const dossier = useMemo(
    () => (story ? storyNarrativeDossier(story, Math.min(lastAccessible ?? 0, Math.max(0, (chapters?.length || 1) - 1))) : null),
    [story, lastAccessible, chapters?.length],
  );
  return <div className="reading-tools">
    <div className={`reading-tools-tabs ${dossier ? 'has-dossier' : ''}`} role="group" aria-label="阅读工具分类">
      <button type="button" aria-pressed={tab === 'search'} onClick={() => setTab('search')}>书内查找</button>
      <button type="button" aria-pressed={tab === 'bookmarks'} onClick={() => setTab('bookmarks')}>位置书签{bookmarks.length ? ` · ${bookmarks.length}` : ''}</button>
      {dossier && <button type="button" aria-pressed={tab === 'dossier'} onClick={() => setTab('dossier')}>剧情概览</button>}
    </div>
    {tab === 'search' && <>
      {metrics.charCount > 0 && (
        <p className="reading-tools-metrics" aria-label="本章阅读统计">
          <span>第 {currentChapterIndex + 1} 章 · 约 {metrics.charCount} 字</span>
          <span>预计 {metrics.readingMinutes} 分钟读完</span>
        </p>
      )}
      <label className="reading-search-label">查找已开启的正文
        <input type="search" autoComplete="off" placeholder="输入字词或人物名字" maxLength={100}
          value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      <p className="reading-tools-status" role="status">{!query.trim() ? '只搜索这本书已开启的章节，不会提前揭晓剧情。' : total ? (hasMore ? `前 60 处结果，共 ${total} 处` : `${total} 处结果`) : '没有找到，试试更短的词。'}</p>
      <div className="reading-search-results">
        {results.map(result => <button type="button" key={`${result.chapterIndex}-${result.paragraph}-${result.offset ?? 0}`} onClick={() => onSelect(result.chapterIndex, { paragraph: result.paragraph, offset: result.anchorOffset ?? 0 })}>
          <strong>{result.title}</strong><span>{result.snippet}</span>
        </button>)}
      </div>
    </>}
    {tab === 'bookmarks' && <>
      {onToggleStoryBookmark && (
        <button type="button" className="reading-bookmark-add" onClick={handleToggleStoryBookmark} aria-pressed={storyBookmarked}>
          {storyBookmarked ? '取消收藏本书' : '收藏本书'}
          {collectFx && (
            <PixelfxCanvas
              key={collectFx.key}
              className="reading-bookmark-fx"
              pick={collectFx.pick}
              loop={false}
              onDone={() => setCollectFx(null)}
            />
          )}
        </button>
      )}
      <button type="button" className="reading-bookmark-add" onClick={() => {
        const ok = onBookmark?.();
        // BUGHUNT-20261110: "full" is the store refusing a new
        // bookmark at the 80-bookmark cap — say so, don't claim it
        // landed (and don't reuse the no-anchor wording).
        setPositionBookmarkNote(ok === "full" ? "书签已满 80 条，先删一条再加。" : ok === false ? "没能定位到当前位置，请稍后再试。" : "");
      }}>标记／取消当前位置</button>
      {positionBookmarkNote && <p className="reading-tools-status" role="status">{positionBookmarkNote}</p>}
      <p className="reading-tools-status">书签保存在本机；重写后的旧剧情书签不会跳到新剧情。</p>
      {!bookmarks.length && <p className="reading-tools-empty"><img className="empty-row-art" src="/art/empty-bookmarks-512.webp" alt="" loading="lazy" />还没有位置书签。</p>}
      <div className="reading-search-results">
        {bookmarks.map(item => <div className={`reading-bookmark-row${confirmingBookmarkKey === bookmarkRowKey(item) ? " is-confirming" : ""}`} key={bookmarkRowKey(item)}>
          <button type="button" onClick={() => onSelect(item.chapterIndex, item.anchor)}><strong>{item.title}</strong><span>{item.excerpt}</span></button>
          {confirmingBookmarkKey !== bookmarkRowKey(item) ? (
            <button type="button" className="reading-bookmark-remove" onClick={() => setConfirmingBookmarkKey(bookmarkRowKey(item))} aria-label={`删除书签：${item.title}`}>删除</button>
          ) : (
            <div className="reading-bookmark-confirm">
              <button type="button" className="reading-bookmark-remove" onClick={() => { onRemove(item); setConfirmingBookmarkKey(''); setBookmarkRemovedNote('书签已删除。'); }}>确认删除</button>
              <button type="button" className="reading-bookmark-remove" onClick={() => setConfirmingBookmarkKey('')}>再想想</button>
            </div>
          )}
        </div>)}
      </div>
      {bookmarkRemovedNote && <p className="reading-tools-status" role="status">{bookmarkRemovedNote}</p>}
    </>}
    {tab === 'dossier' && dossier && (
      <div className="reading-dossier" role="region" aria-label="剧情概览">
        <section className="reading-dossier-card">
          <span className="reading-dossier-kicker">{dossier.worldName} · {dossier.currentBeat.act}</span>
          <strong>{dossier.currentBeat.dramaticQuestion}</strong>
          {dossier.premise && <p>{dossier.premise}</p>}
        </section>
        {dossier.activeConsequences.length > 0 && (
          <section className="reading-dossier-section">
            <h3>已选分支</h3>
            <ul className="reading-dossier-list">
              {dossier.activeConsequences.map(item => (
                <li key={`${item.chapterNumber}-${item.choiceId}`}>
                  <strong>第 {item.chapterNumber} 章：{item.label}</strong>
                  <span>{item.consequence}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {dossier.ledger && (dossier.ledger.events.length > 0 || dossier.ledger.openForeshadowing.length > 0) && (
          <section className="reading-dossier-section">
            <h3>事件与伏笔台账</h3>
            <ul className="reading-dossier-list">
              {dossier.ledger.events.map(item => (
                <li key={`event-${item.chapter}-${item.text}`}>
                  <strong>第 {item.chapter} 章 · 事件</strong>
                  <span>{item.text}</span>
                </li>
              ))}
              {dossier.ledger.openForeshadowing.map(item => (
                <li key={`fore-${item.chapter}-${item.text}`}>
                  <strong>第 {item.chapter} 章 · 伏笔未收</strong>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {dossier.rules.length > 0 && (
          <section className="reading-dossier-section">
            <h3>世界设定</h3>
            <ul className="reading-dossier-list">
              {dossier.rules.map((rule, idx) => (
                <li key={idx}><span>{rule}</span></li>
              ))}
            </ul>
          </section>
        )}
        {dossier.timeline.length > 0 && (
          <section className="reading-dossier-section">
            <h3>章节摘要</h3>
            <div className="reading-search-results">
              {dossier.timeline.map(item => (
                <button
                  type="button"
                  key={item.chapterIndex}
                  onClick={() => onSelect(item.chapterIndex, { paragraph: 0, offset: 0 })}
                >
                  <strong>第 {item.chapterNumber} 章 · {item.title}{item.choiceLabel ? `（已选：${item.choiceLabel}）` : ''}</strong>
                  <span>{item.summary || item.act}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    )}
    {warning && <p className="reading-tools-status" role="status">{warning}</p>}
  </div>;
}
