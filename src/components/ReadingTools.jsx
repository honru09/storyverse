import { useMemo, useState } from 'react';
import { findInChapters } from '../reading-location.js';

export default function ReadingTools({ chapters, lastAccessible, bookmarks, onSelect, onBookmark, onRemove, warning }) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('search');
  const results = useMemo(() => findInChapters(chapters, query, lastAccessible), [chapters, query, lastAccessible]);
  return <div className="reading-tools">
    <div className="reading-tools-tabs" role="group" aria-label="阅读工具分类">
      <button type="button" aria-pressed={tab === 'search'} onClick={() => setTab('search')}>书内查找</button>
      <button type="button" aria-pressed={tab === 'bookmarks'} onClick={() => setTab('bookmarks')}>位置书签{bookmarks.length ? ` · ${bookmarks.length}` : ''}</button>
    </div>
    {tab === 'search' ? <>
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
    </> : <>
      <button type="button" className="reading-bookmark-add" onClick={onBookmark}>标记／取消当前位置</button>
      <p className="reading-tools-status">书签保存在本机；重写后的旧剧情书签不会跳到新剧情。</p>
      {!bookmarks.length && <p className="reading-tools-empty">还没有位置书签。</p>}
      <div className="reading-search-results">
        {bookmarks.map(item => <div className="reading-bookmark-row" key={`${item.key}-${item.anchor.paragraph}`}>
          <button type="button" onClick={() => onSelect(item.chapterIndex, item.anchor)}><strong>{item.title}</strong><span>{item.excerpt}</span></button>
          <button type="button" className="reading-bookmark-remove" onClick={() => onRemove(item)} aria-label={`删除书签：${item.title}`}>删除</button>
        </div>)}
      </div>
    </>}
    {warning && <p className="reading-tools-status" role="status">{warning}</p>}
  </div>;
}
