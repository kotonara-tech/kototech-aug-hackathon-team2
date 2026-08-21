/** インセンティブ（奨励金）の支払処理 — 担当: 活動/インセンティブ班 */
import { Router } from 'express'
import { z } from 'zod'
import { Repo, fiscalYearOf } from '../../db/repo.js'
import { buildTransferCsv } from '../../domain/incentive.js'
import { pathId, requireRole } from '../http.js'

const scheduleSchema = z.object({ scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })

export function paymentsRouter(repo: Repo): Router {
  const router = Router()

  router.get('/payments', requireRole('city', 'group'), (req, res) => {
    const list =
      req.user.role === 'city' ? repo.listPayments() : repo.listPayments({ groupId: req.user.groupId! })
    res.json(list)
  })

  // ':id' より先に定義しないと transfer.csv が ID として解釈される
  router.get('/payments/transfer.csv', requireRole('city'), (_req, res) => {
    const csv = buildTransferCsv(repo.listPayments())
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="nara-clean-transfer.csv"')
    // Excel が UTF-8 と判定できるよう BOM を付ける（自治体の実務では必須になりやすい）
    res.send('﻿' + csv)
  })

  router.post('/payments/:id/schedule', requireRole('city'), (req, res) => {
    const payment = repo.getPayment(pathId(req))
    if (!payment) return res.status(404).json({ error: '支払データが見つかりません' })

    const parsed = scheduleSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: '支払予定日を指定してください' })

    const updated = { ...payment, status: 'scheduled' as const, scheduledDate: parsed.data.scheduledDate }
    repo.savePayment(updated, fiscalYearOf(`${parsed.data.scheduledDate}T00:00:00.000Z`))
    res.json(updated)
  })

  return router
}
