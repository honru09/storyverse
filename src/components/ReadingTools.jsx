import { useMemo, useState } from 'react';
import { estimateReadingMetrics, findInChapters } from '../reading-location.js';
import { storyNarrativeDossier } from '../story-engine.js';

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
  const results = useMemo(() => findInChapters(chapters, query, lastAccessible), [chapters, query, lastAccessible]);
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
      <p className="reading-tools-status" role="status">{!query.trim() ? '只搜索这本书已开启的章节，不会提前揭晓剧情。' : results.length ? `${results.length === 60 ? '前 ' : ''}${results.length} 处结果` : '没有找到，试试更短的词。'}</p>
      <div className="reading-search-results">
        {results.map(result => <button type="button" key={`${result.chapterIndex}-${result.paragraph}`} onClick={() => onSelect(result.chapterIndex, { paragraph: result.paragraph, offset: 0 })}>
          <strong>{result.title}</strong><span>{result.snippet}</span>
        </button>)}
      </div>
    </>}
    {tab === 'bookmarks' && <>
      {onToggleStoryBookmark && (
        <button type="button" className="reading-bookmark-add" onClick={onToggleStoryBookmark} aria-pressed={storyBookmarked}>
          {storyBookmarked ? '取消收藏本书' : '收藏本书'}
        </button>
      )}
      <button type="button" className="reading-bookmark-add" onClick={onBookmark}>标记／取消当前位置</button>
      <p className="reading-tools-status">书签保存在本机；重写后的旧剧情书签不会跳到新剧情。</p>
      {!bookmarks.length && <p className="reading-tools-empty"><img className="empty-row-art" src="/art/empty-bookmarks-512.webp" alt="" loading="lazy" />还没有位置书签。</p>}
      <div className="reading-search-results">
        {bookmarks.map(item => <div className="reading-bookmark-row" key={`${item.key}-${item.anchor.paragraph}`}>
          <button type="button" onClick={() => onSelect(item.chapterIndex, item.anchor)}><strong>{item.title}</strong><span>{item.excerpt}</span></button>
          <button type="button" className="reading-bookmark-remove" onClick={() => onRemove(item)} aria-label={`删除书签：${item.title}`}>删除</button>
        </div>)}
      </div>
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
