/** ごみ回収依頼 — 活動実績の確認とは独立して進行する業務フロー */
import { DomainError } from './errors.js'
import type { PickupRequest, PickupRequestInput } from './types.js'

export class PickupError extends DomainError {}

export function createPickupRequest(input: PickupRequestInput, now: string): PickupRequest {
  if (!input.required) {
    return {
      status: 'not_required',
      wasteTypes: [],
      bagCount: 0,
      location: null,
      preferredDate: null,
      note: '',
      requestedAt: null,
      scheduledDate: null,
      collectedAt: null,
    }
  }

  if (input.wasteTypes.length === 0) throw new PickupError('VALIDATION', 'ごみの種類を1つ以上選んでください')
  if (!Number.isInteger(input.bagCount) || input.bagCount <= 0) {
    throw new PickupError('VALIDATION', '袋数は1以上の整数で入力してください')
  }
  if (!input.location.address.trim()) throw new PickupError('VALIDATION', '回収場所を入力してください')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.preferredDate)) {
    throw new PickupError('VALIDATION', '回収希望日を入力してください')
  }

  return {
    status: 'requested',
    wasteTypes: [...input.wasteTypes],
    bagCount: input.bagCount,
    location: { ...input.location },
    preferredDate: input.preferredDate,
    note: input.note.trim(),
    requestedAt: now,
    scheduledDate: null,
    collectedAt: null,
  }
}

export type PickupAction =
  | { type: 'schedule'; scheduledDate: string }
  | { type: 'complete' }

export function updatePickupRequest(request: PickupRequest, action: PickupAction, now: string): PickupRequest {
  if (action.type === 'schedule') {
    if (request.status !== 'requested') {
      throw new PickupError('INVALID_STATE', '回収依頼済みの案件だけを手配できます')
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(action.scheduledDate)) {
      throw new PickupError('VALIDATION', '回収予定日を入力してください')
    }
    return { ...request, status: 'scheduled', scheduledDate: action.scheduledDate }
  }

  if (request.status !== 'requested' && request.status !== 'scheduled') {
    throw new PickupError('INVALID_STATE', '回収依頼中の案件だけを回収済みにできます')
  }
  return { ...request, status: 'collected', collectedAt: now }
}
