import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { switchUser, useApi } from './api'
import type { Me } from './types'
import { Dashboard } from './pages/Dashboard'
import { Activities } from './pages/Activities'
import { Events } from './pages/Events'
import { Groups } from './pages/Groups'
import { Board } from './pages/Board'
import { Payments } from './pages/Payments'
import { MyPage } from './pages/MyPage'

/** デモ用の利用者切替。本番では認証基盤に置き換える。 */
const DEMO_USERS = [
  { id: 'u-city', label: '奈良市 清美課（市職員）' },
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
  { to: '/events', label: 'イベント募集', roles: ['city', 'group', 'member'] },
  { to: '/groups', label: '団体の活動状況', roles: ['city', 'group', 'member'] },
  { to: '/board', label: '団体間掲示板', roles: ['city', 'group', 'member'] },
  { to: '/payments', label: 'インセンティブ', roles: ['city', 'group'] },
  { to: '/me', label: 'マイページ', roles: ['member', 'group', 'city'] },
]

export function App() {
  const { data: me, error, reload } = useApi<Me>('/me')

  return (
    <>
      <header className="app-header">
        <div className="brand">
          ならクリーン <small>奈良市 清掃ボランティア支援</small>
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
          <NavLink key={t.to} to={t.to} end={t.to === '/'}>
            {t.label}
          </NavLink>
        ))}
      </nav>

      <main>
        {error && <div className="alert error">{error}</div>}
        {me && (
          <Routes>
            <Route path="/" element={<Dashboard me={me} />} />
            <Route path="/activities" element={<Activities me={me} />} />
            <Route path="/events" element={<Events me={me} onPointsChanged={reload} />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/board" element={<Board me={me} />} />
            <Route path="/payments" element={<Payments me={me} />} />
            <Route path="/me" element={<MyPage me={me} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
    </>
  )
}
