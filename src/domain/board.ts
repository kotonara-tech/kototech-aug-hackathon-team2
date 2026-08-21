/** 団体間コミュニケーション掲示板 */
import { randomUUID } from 'node:crypto'
import { DomainError } from './errors.js'
import type { Actor, BoardPost, PostCategory } from './types.js'

export class BoardError extends DomainError {}

export const MAX_POST_LENGTH = 2_000

/** 掲示板は団体同士の連携の場。個人メンバーは閲覧のみ。 */
export function canPost(actor: Actor): boolean {
  return actor.role === 'group' || actor.role === 'city'
}

export interface NewPostInput {
  actor: Actor
  body: string
  category: PostCategory
}

export function createPost({ actor, body, category }: NewPostInput, now: string): BoardPost {
  if (!canPost(actor)) throw new BoardError('FORBIDDEN', '団体間掲示板に投稿できるのは団体と市のみです')

  const trimmed = body.trim()
  if (trimmed.length === 0) throw new BoardError('EMPTY', '本文を入力してください')
  if (trimmed.length > MAX_POST_LENGTH) {
    throw new BoardError('TOO_LONG', `本文は${MAX_POST_LENGTH}文字以内で入力してください`)
  }

  return {
    id: randomUUID(),
    groupId: actor.groupId,
    authorId: actor.id,
    category,
    body: trimmed,
    createdAt: now,
  }
}
