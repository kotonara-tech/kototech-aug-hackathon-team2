import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { switchUser, useApi } from './api'
import type { Me } from './types'
import { Dashboard } from './pages/Dashboard'
import { Activities } from './pages/Activities'
import { Events } from './pages/Events'
import { Groups } from './pages/Groups'
import { MyPage } from './pages/MyPage'
import { AnnualReport } from './pages/AnnualReport'

/** デモ用の利用者切替。本番では認証基盤に置き換える。 */
const DEMO_USERS = [
  { id: 'u-city', label: '奈良市 地域づくり推進課（市職員）' },
  { id: 'u-group-a', label: '佐保川をきれいにする会（団体）' },
  { id: 'u-group-b', label: 'ならまち美化クラブ（団体）' },
  { id: 'u-group-c', label: '奈良女子大 環境サークル（団体）' },
  { id: 'u-member-1', label: 'あかり 21歳（個人）' },
  { id: 'u-member-3', label: 'ゆうと 19歳（個人）' },
]

interface Tab {
  to: string
  label: string
  roles: Me['role'][]
}

const TABS: Tab[] = [
  { to: '/', label: 'ダッシュボード', roles: ['city', 'group', 'member'] },
  { to: '/activities', label: '活動管理', roles: ['city', 'group'] },
  { to: '/events', label: '参加者募集', roles: ['group'] },
  { to: '/events', label: '団体の募集に参加', roles: ['member'] },
  { to: '/groups', label: '団体の活動状況', roles: ['city', 'group'] },
  { to: '/reports', label: '年度活動実績', roles: ['city'] },
  { to: '/me', label: 'マイページ', roles: ['member', 'group', 'city'] },
]

export function App() {
  const { data: me, error, reload } = useApi<Me>('/me')
  const { data: health } = useApi<{ ok: boolean; apiVersion?: string }>('/health')
  const incompatibleApi = health?.ok && health.apiVersion !== 'green-support-v2'

  return (
    <>
      <header className="app-header">
        <div className="brand">
          ならクリーン <small>奈良市 グリーンサポート活動支援</small>
        </div>
        <div className="user-switch">
          <span>表示中:</span>
          <select value={me?.id ?? ''} onChange={(e) => switchUser(e.target.value)}>
            {DEMO_USERS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <nav className="tabs">
        {TABS.filter((t) => !me || t.roles.includes(me.role)).map((t) => (
          <NavLink key={`${t.to}:${t.roles.join(',')}`} to={t.to} end={t.to === '/'}>
            {t.label}
          </NavLink>
        ))}
      </nav>

      <main>
        {incompatibleApi && (
          <div className="alert error">
            古いAPIに接続しています。起動中の開発サーバーを停止し、<code>npm run demo</code>で起動してください。
          </div>
        )}
        {error && <div className="alert error">{error}</div>}
        {me && !incompatibleApi && (
          <Routes>
            <Route path="/" element={<Dashboard me={me} />} />
            <Route path="/activities" element={<Activities me={me} />} />
            <Route path="/events" element={<Events me={me} onPointsChanged={reload} />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/reports" element={<AnnualReport />} />
            <Route path="/me" element={<MyPage me={me} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
    </>
  )
}
