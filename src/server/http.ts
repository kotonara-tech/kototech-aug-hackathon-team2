/** HTTP 層の共通部品（認証・権限・パラメータ正規化） */
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { Repo, UserRow } from '../db/repo.js'
import type { Actor } from '../domain/types.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: UserRow
      actor: Actor
    }
  }
}

/**
 * 認証。プロトタイプのため署名付きトークンではなくヘッダの利用者IDで代用している。
 * 本番では奈良市の共通認証／マイナポータル連携に差し替える想定。
 */
export function authenticate(repo: Repo): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health') return next()

    const id = req.header('x-user-id')
    const user = id ? repo.getUser(id) : null
    if (!user) {
      res.status(401).json({ error: 'ログインが必要です' })
      return
    }

    req.user = user
    req.actor = { id: user.id, role: user.role, groupId: user.groupId }
    next()
  }
}

export function requireRole(...roles: UserRow['role'][]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'この操作を行う権限がありません' })
      return
    }
    next()
  }
}

/** Express 5 の型では params が string|string[] になるため、ここで正規化する */
export function pathId(req: Request): string {
  const raw = req.params.id
  return Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
}

export function now(): string {
  return new Date().toISOString()
}
