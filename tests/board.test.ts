import { describe, it, expect } from 'vitest'
import { createPost, canPost, BoardError } from '@/domain/board'

const groupA = { id: 'u-a', role: 'group' as const, groupId: 'g-a' }
const member = { id: 'u-m', role: 'member' as const, groupId: 'g-a' }
const city = { id: 'u-city', role: 'city' as const, groupId: null }
const NOW = '2026-05-01T00:00:00.000Z'

describe('団体間コミュニケーション掲示板', () => {
  it('団体は投稿できる', () => {
    expect(canPost(groupA)).toBe(true)
  })

  it('市は投稿できる（連絡・お知らせ）', () => {
    expect(canPost(city)).toBe(true)
  })

  it('個人メンバーは団体間掲示板に投稿できない', () => {
    expect(canPost(member)).toBe(false)
    expect(() => createPost({ actor: member, body: 'こんにちは', category: '雑談' }, NOW)).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    )
  })

  it('空文字の投稿は拒否する', () => {
    expect(() => createPost({ actor: groupA, body: '   ', category: '雑談' }, NOW)).toThrow(BoardError)
  })

  it('2000文字を超える投稿は拒否する', () => {
    const body = 'あ'.repeat(2001)
    expect(() => createPost({ actor: groupA, body, category: '雑談' }, NOW)).toThrowError(
      expect.objectContaining({ code: 'TOO_LONG' }),
    )
  })

  it('投稿には作成者・日時・カテゴリが記録される', () => {
    const post = createPost({ actor: groupA, body: '道具の貸し借りできませんか', category: '資機材' }, NOW)
    expect(post).toMatchObject({ groupId: 'g-a', authorId: 'u-a', category: '資機材', createdAt: NOW })
    expect(post.body).toBe('道具の貸し借りできませんか')
  })

  it('前後の空白は取り除く', () => {
    expect(createPost({ actor: groupA, body: '  ごみ袋余ってます  ', category: '資機材' }, NOW).body).toBe(
      'ごみ袋余ってます',
    )
  })
})
