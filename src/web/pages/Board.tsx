import { useState } from 'react'
import { api, useApi } from '../api'
import type { Me, Post } from '../types'
import { Empty, formatDateTime } from '../components/ui'

const CATEGORIES = ['資機材', '共同開催', 'ノウハウ', '雑談', 'お知らせ'] as const

export function Board({ me }: { me: Me }) {
  const { data, error, reload } = useApi<Post[]>('/board')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('資機材')
  const [filter, setFilter] = useState<string>('')
  const [posting, setPosting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const canPost = me.role !== 'member'

  async function submit() {
    setPosting(true)
    setMessage(null)
    try {
      await api.post('/board', { body, category })
      setBody('')
      reload()
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setPosting(false)
    }
  }

  const posts = (data ?? []).filter((p) => !filter || p.category === filter)

  return (
    <>
      <h1>団体間掲示板</h1>
      <p className="page-lead">
        資機材の貸し借り、合同開催の相談、ノウハウの共有など、団体同士・市とのやり取りをここに集約します。
      </p>

      {message && <div className="alert error">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      {canPost ? (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="field">
            <label>カテゴリ</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
              style={{ maxWidth: 220 }}
            >
              {CATEGORIES.filter((c) => c !== 'お知らせ' || me.role === 'city').map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>本文（2000文字まで）</label>
            <textarea
              value={body}
              placeholder="例）9月の活動でトングが10本余ります。必要な団体はご連絡ください。"
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <button onClick={submit} disabled={posting || body.trim().length === 0}>
            投稿する
          </button>
        </div>
      ) : (
        <div className="alert info">閲覧のみ可能です。投稿は団体および市の担当者が行えます。</div>
      )}

      <div className="chips">
        <button className={`chip ${filter === '' ? 'active' : ''}`} onClick={() => setFilter('')}>
          すべて
        </button>
        {CATEGORIES.map((c) => (
          <button key={c} className={`chip ${filter === c ? 'active' : ''}`} onClick={() => setFilter(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="list">
        {posts.map((p) => (
          <article key={p.id} className="card">
            <div className="spread">
              <strong>{p.groupName ?? '奈良市'}</strong>
              <span className={`badge ${p.category === 'お知らせ' ? 'warn' : 'gray'}`}>{p.category}</span>
            </div>
            <p style={{ whiteSpace: 'pre-wrap', margin: '0.5rem 0 0.25rem' }}>{p.body}</p>
            <div className="muted">{formatDateTime(p.createdAt)}</div>
          </article>
        ))}
        {posts.length === 0 && <Empty>まだ投稿がありません</Empty>}
      </div>
    </>
  )
}
