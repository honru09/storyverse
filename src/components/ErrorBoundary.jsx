import React from 'react'
import { STORAGE_KEY } from '../persistence.js'
import { downloadText } from '../downloads.js'

export default class ErrorBoundary extends React.Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <main className="recovery-page">
      <p className="page-caption">织界</p>
      <h1>这一页暂时没能打开。</h1>
      <p>先保存一份备份，再重新打开。你的存档不会被清空。</p>
      <button className="button button-primary" onClick={() => {
        window.history.replaceState(null, '', '#/home')
        window.location.reload()
      }}>回到书架</button>
      <button className="button button-secondary" onClick={() => {
        try { downloadText(localStorage.getItem(STORAGE_KEY) || '{}', 'storyweave-recovery.json') }
        catch { this.setState({ message: '无法读取存档，请检查浏览器的存储权限。' }) }
      }}>导出原始存档</button>
      {this.state.message && <p role="alert">{this.state.message}</p>}
    </main>
  }
}
