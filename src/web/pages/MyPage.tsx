import { useApi } from '../api'
import { Link } from 'react-router-dom'
import type { EventDto, GroupDetail, Me } from '../types'
import { Empty, RankBadge, Stat, formatDate, formatDateTime } from '../components/ui'

export function MyPage({ me }: { me: Me }) {
  const { data: events } = useApi<EventDto[]>('/events')
  const { data: group } = useApi<GroupDetail>(me.groupId ? `/groups/${me.groupId}` : null, [me.groupId])

  const joined = (events ?? []).filter((e) =>
    e.participants?.some((p) => p.memberId === me.id && p.status !== 'cancelled'),
  )

  return (
    <>
      <h1>マイページ</h1>
      <p className="page-lead">
        {me.name}
        {me.groupName && `（${me.groupName}）`}
      </p>

      {me.role === 'member' ? (
        <>
          <div className="grid cols-3">
            <Stat label="累計ポイント" value={me.totalPoints.toLocaleString()} unit="pt" />
            <Stat label="ランク" value={<RankBadge rank={me.rank} />} />
            <Stat label="参加回数" value={me.history.length} unit="回" />
          </div>

          <div className="card spread" style={{ marginTop: '0.75rem' }}>
            <div>
              <strong>次の清掃活動に参加しませんか？</strong>
              <div className="muted">団体が募集中の活動から、日時や場所を選んで申し込めます。</div>
            </div>
            <Link className="btn" to="/events">
              団体の募集を見る
            </Link>
          </div>

          {me.nextRank && (
            <div className="card" style={{ marginTop: '0.75rem' }}>
              <div className="spread">
                <span>次のランク「{me.nextRank.next}」まで</span>
                <strong>あと {me.nextRank.remaining.toLocaleString()} pt</strong>
              </div>
              <div className="progress" style={{ marginTop: '0.5rem' }}>
                <div
                  style={{
                    width: `${Math.round((me.totalPoints / (me.totalPoints + me.nextRank.remaining)) * 100)}%`,
                  }}
                />
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>
                29歳以下は獲得ポイント1.5倍、初参加には歓迎ボーナス100pt、友人紹介は1人50pt（3人まで）。
              </p>
            </div>
          )}

          <h2>ポイント履歴</h2>
          <div className="card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>イベント</th>
                  <th>参加日</th>
                  <th className="num">獲得pt</th>
                </tr>
              </thead>
              <tbody>
                {me.history.map((h) => (
                  <tr key={h.eventId}>
                    <td>{h.eventTitle}</td>
                    <td>{formatDate(h.startsAt)}</td>
                    <td className="num">+{h.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {me.history.length === 0 && <Empty>まだポイント履歴がありません。イベントに参加してみましょう。</Empty>}
          </div>

          <h2>申込中のイベント</h2>
          <div className="list">
            {joined.map((e) => (
              <div key={e.id} className="card spread">
                <div>
                  <strong>{e.title}</strong>
                  <div className="muted">
                    {formatDateTime(e.startsAt)}／{e.meetingPoint.address}
                  </div>
                </div>
                <span className="badge ok">申込済み</span>
              </div>
            ))}
            {joined.length === 0 && <Empty>申込中のイベントはありません</Empty>}
          </div>
        </>
      ) : (
        <>
          <div className="grid cols-4">
            <Stat label="団体の累計ポイント" value={(group?.totalPoints ?? 0).toLocaleString()} unit="pt" />
            <Stat label="ランク" value={<RankBadge rank={group?.rank ?? '—'} />} />
            <Stat label="活動回数" value={group?.activityCount ?? 0} unit="回" />
            <Stat label="連続活動" value={group?.consecutiveMonths ?? 0} unit="か月" />
          </div>
          {group?.nextRank && (
            <div className="card" style={{ marginTop: '0.75rem' }}>
              次のランク「{group.nextRank.next}」まで あと {group.nextRank.remaining.toLocaleString()} pt
              <p className="muted" style={{ marginBottom: 0 }}>
                連続活動が3か月で1.1倍、6か月で1.2倍、12か月以上で1.3倍のポイント倍率になります。
              </p>
            </div>
          )}
          {me.role === 'city' && (
            <div className="alert info" style={{ marginTop: '1rem' }}>
              市の担当者アカウントです。審査は「活動管理」、支払処理は「インセンティブ」から行えます。
            </div>
          )}
        </>
      )}
    </>
  )
}
