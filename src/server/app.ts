/**
 * HTTP API の組み立て。
 *
 * ビジネスルールは domain/ に、SQL は db/ にあり、この層は
 * 「認証・入力検証・永続化の呼び出し・DTO整形」だけを担当する。
 *
 * ルートは機能ごとに routes/ へ分割している（3人以上で並行開発するため）。
 * 新しい機能を足すときは routes/ にファイルを1つ増やし、ここで mount する。
 */
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import type { Repo } from '../db/repo.js'
import { DomainError, HTTP_STATUS_BY_CODE } from '../domain/errors.js'
import { authenticate } from './http.js'
import { meRouter } from './routes/me.js'
import { activitiesRouter } from './routes/activities.js'
import { paymentsRouter } from './routes/payments.js'
import { eventsRouter } from './routes/events.js'
import { boardRouter } from './routes/board.js'
import { groupsRouter } from './routes/groups.js'
import { mapRouter } from './routes/map.js'

export function createApp(repo: Repo): Express {
  const app = express()

  app.use(cors())
  app.use(express.json({ limit: '2mb' }))
  app.use('/api', authenticate(repo))

  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  for (const router of [
    meRouter(repo),
    activitiesRouter(repo),
    paymentsRouter(repo),
    eventsRouter(repo),
    boardRouter(repo),
    groupsRouter(repo),
    mapRouter(repo),
  ]) {
    app.use('/api', router)
  }

  app.use(errorHandler)

  return app
}

/** ドメイン層の例外を HTTP ステータスへ変換する */
function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof DomainError) {
    res.status(HTTP_STATUS_BY_CODE[err.code] ?? 400).json({ error: err.message, code: err.code })
    return
  }
  if (err instanceof RangeError) {
    res.status(400).json({ error: err.message })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'サーバ内部でエラーが発生しました' })
}
