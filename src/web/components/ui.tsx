import type { ReactNode } from 'react'

export function Stat({ label, value, unit }: { label: string; value: ReactNode; unit?: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
    </div>
  )
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  draft: { text: '下書き', cls: 'gray' },
  submitted: { text: '審査待ち', cls: 'warn' },
  approved: { text: '承認済み（報告待ち）', cls: '' },
  rejected: { text: '却下', cls: 'danger' },
  reported: { text: '報告書提出済み（確認待ち）', cls: 'warn' },
  verified: { text: '実績確定', cls: 'ok' },
  paid: { text: '奨励金支払済み', cls: 'ok' },
  cancelled: { text: '中止', cls: 'gray' },
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { text: status, cls: 'gray' }
  return <span className={`badge ${s.cls}`}>{s.text}</span>
}

const PAYMENT_LABEL: Record<string, { text: string; cls: string }> = {
  pending: { text: '未確定', cls: 'warn' },
  scheduled: { text: '支払確定', cls: '' },
  paid: { text: '支払済み', cls: 'ok' },
}

export function PaymentBadge({ status }: { status: string }) {
  const s = PAYMENT_LABEL[status] ?? { text: status, cls: 'gray' }
  return <span className={`badge ${s.cls}`}>{s.text}</span>
}

export function RankBadge({ rank }: { rank: string }) {
  const cls = rank === 'プラチナ' || rank === 'ゴールド' ? 'warn' : ''
  return <span className={`badge ${cls}`}>{rank}</span>
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="card" style={{ textAlign: 'center', color: 'var(--muted)' }}>
      {children}
    </div>
  )
}

export function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${formatDate(iso)} ${hh}:${mm}`
}

export function yen(n: number): string {
  return `¥${n.toLocaleString('ja-JP')}`
}
