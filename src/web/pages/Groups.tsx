import { useState } from 'react'
import { useApi } from '../api'
import type { GroupDetail, GroupSummary } from '../types'
import { Empty, RankBadge, StatusBadge, formatDate } from '../components/ui'

export function Groups() {
  const { data } = useApi<GroupSummary[]>('/groups')
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <>
      <h1>団体の活動状況</h1>
      <p className="page-lead">
        どの団体がどこで活動しているかを相互に確認できます。重複や空白地帯を避け、団体同士の連携につなげるための画面です。
      </p>

      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>団体</th>
              <th>ランク</th>
              <th className="num">累計pt</th>
              <th className="num">活動回数</th>
              <th className="num">回収量</th>
              <th className="num">延べ人数</th>
              <th>最終活動</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((g) => (
              <tr key={g.groupId}>
                <td>{g.name}</td>
                <td>
                  <RankBadge rank={g.rank} />
                </td>
                <td className="num">{g.totalPoints.toLocaleString()}</td>
                <td className="num">{g.activityCount}</td>
                <td className="num">{Math.round(g.garbageKg * 10) / 10} kg</td>
                <td className="num">{g.participants}</td>
                <td>{g.lastActivityDate ? formatDate(g.lastActivityDate) : '—'}</td>
                <td>
                  <button
                    className="ghost"
                    onClick={() => setSelected(selected === g.groupId ? null : g.groupId)}
                  >
                    {selected === g.groupId ? '閉じる' : '詳細'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && <GroupDetailPanel groupId={selected} />}
    </>
  )
}

function GroupDetailPanel({ groupId }: { groupId: string }) {
  const { data } = useApi<GroupDetail>(`/groups/${groupId}`, [groupId])
  if (!data) return null

  const published = data.activities.filter((a) => a.status === 'verified' || a.status === 'paid')

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <div className="spread">
        <div>
          <h2 style={{ margin: 0 }}>{data.name}</h2>
          <div className="muted">連絡先: {data.contact}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <RankBadge rank={data.rank} />
          <div className="muted">
            累計 {data.totalPoints.toLocaleString()} pt／連続活動 {data.consecutiveMonths} か月
          </div>
        </div>
      </div>

      {data.nextRank && (
        <p className="muted">
          次の「{data.nextRank.next}」まであと {data.nextRank.remaining.toLocaleString()} pt
        </p>
      )}

      <h2>これまでの活動</h2>
      <div className="list">
        {published.map((a) => (
          <div key={a.id} className="spread" style={{ borderBottom: '1px solid var(--line)', paddingBottom: '0.5rem' }}>
            <div>
              <strong>{a.title}</strong>
              <div className="muted">
                {formatDate(a.scheduledDate)}／{a.location.address}
                {a.report && `／${a.report.actualParticipants}人・${a.report.garbageKg}kg`}
              </div>
            </div>
            <StatusBadge status={a.status} />
          </div>
        ))}
        {published.length === 0 && <Empty>確定した活動実績はまだありません</Empty>}
      </div>
    </div>
  )
}
