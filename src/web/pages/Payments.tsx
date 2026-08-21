import { useState } from 'react'
import { api, currentUserId, useApi } from '../api'
import type { Me, Payment } from '../types'
import { Empty, PaymentBadge, Stat, formatDate, yen } from '../components/ui'

export function Payments({ me }: { me: Me }) {
  const { data, error, reload } = useApi<Payment[]>('/payments')
  const [scheduledDate, setScheduledDate] = useState(defaultPayDate())
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const payments = data ?? []
  const pending = payments.filter((p) => p.status === 'pending')
  const scheduled = payments.filter((p) => p.status === 'scheduled')
  const paid = payments.filter((p) => p.status === 'paid')
  const sum = (list: Payment[]) => list.reduce((s, p) => s + p.amount, 0)

  async function schedule(p: Payment) {
    setBusy(p.id)
    setMessage(null)
    try {
      await api.post(`/payments/${p.id}/schedule`, { scheduledDate })
      setMessage(`${p.groupName} への ${yen(p.amount)} を支払確定しました`)
      reload()
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function scheduleAll() {
    for (const p of pending) await schedule(p)
  }

  /** CSV は fetch では取得せず、認証ヘッダ付きで取得して Blob でダウンロードさせる */
  async function downloadCsv() {
    const res = await fetch('/api/payments/transfer.csv', { headers: { 'x-user-id': currentUserId() } })
    if (!res.ok) {
      setMessage('振込データの取得に失敗しました')
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'nara-clean-transfer.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <h1>インセンティブ（奨励金）</h1>
      <p className="page-lead">
        {me.role === 'city'
          ? '確定した活動実績から自動計算した奨励金です。支払を確定し、全銀形式のCSVを会計処理に渡します。'
          : '確定した活動実績に対して市から支払われる奨励金の状況です。'}
      </p>

      {message && <div className="alert info">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="grid cols-3">
        <Stat label="未確定" value={yen(sum(pending))} />
        <Stat label="支払確定（振込待ち）" value={yen(sum(scheduled))} />
        <Stat label="支払済み" value={yen(sum(paid))} />
      </div>

      {me.role === 'city' && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="row">
            <div style={{ minWidth: 180 }}>
              <label>支払予定日</label>
              <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
            </div>
            <button onClick={scheduleAll} disabled={pending.length === 0}>
              未確定 {pending.length} 件をまとめて確定
            </button>
            <button className="ghost" onClick={downloadCsv} disabled={scheduled.length === 0}>
              振込データ(CSV)をダウンロード
            </button>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            算定式: 基本 ¥3,000 ＋ 回収量 ¥100/kg（1活動 上限 ¥30,000／団体 年間上限 ¥200,000）
          </p>
        </div>
      )}

      <h2>支払一覧</h2>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>団体</th>
              <th className="num">金額</th>
              <th>状態</th>
              <th>支払予定日</th>
              <th>備考</th>
              {me.role === 'city' && <th />}
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{p.groupName}</td>
                <td className="num">{yen(p.amount)}</td>
                <td>
                  <PaymentBadge status={p.status} />
                </td>
                <td>{p.scheduledDate ? formatDate(p.scheduledDate) : '—'}</td>
                <td className="muted">
                  {p.cappedBy === 'perActivity' && '1活動上限で調整'}
                  {p.cappedBy === 'annual' && '年間上限で調整'}
                </td>
                {me.role === 'city' && (
                  <td>
                    {p.status === 'pending' && (
                      <button className="ghost" disabled={busy === p.id} onClick={() => schedule(p)}>
                        支払確定
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && <Empty>対象の支払データはありません</Empty>}
      </div>
    </>
  )
}

/** 既定の支払予定日は翌月末（自治体の支出サイクルに合わせた初期値） */
function defaultPayDate(): string {
  const d = new Date()
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0))
  return end.toISOString().slice(0, 10)
}
