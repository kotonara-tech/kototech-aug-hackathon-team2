import { describe, it, expect } from 'vitest'
import viteConfig from '../vite.config'

/**
 * 開発サーバのプロキシ設定の回帰テスト。
 * キーを前方一致の '/api' にすると、フロントのモジュール '/api.ts' まで
 * API サーバへ転送されてしまい、画面が真っ白になる（実際に踏んだ不具合）。
 */
function proxyKeys(): string[] {
  const proxy = (viteConfig as { server?: { proxy?: Record<string, unknown> } }).server?.proxy
  return Object.keys(proxy ?? {})
}

/** Vite の判定規則: '^' で始まるキーは正規表現、それ以外は前方一致 */
function matches(key: string, url: string): boolean {
  return key.startsWith('^') ? new RegExp(key).test(url) : url.startsWith(key)
}

function isProxied(url: string): boolean {
  return proxyKeys().some((k) => matches(k, url))
}

describe('Vite 開発サーバのプロキシ設定', () => {
  it('API へのリクエストはプロキシされる', () => {
    expect(isProxied('/api/health')).toBe(true)
    expect(isProxied('/api/activities?status=submitted')).toBe(true)
  })

  it('フロントエンドのモジュール /api.ts はプロキシしない', () => {
    expect(isProxied('/api.ts')).toBe(false)
  })

  it('/api で始まる別名のモジュールもプロキシしない', () => {
    expect(isProxied('/api-client.ts')).toBe(false)
    expect(isProxied('/apiTypes.ts')).toBe(false)
  })

  it('通常の画面ルートはプロキシしない', () => {
    expect(isProxied('/events')).toBe(false)
    expect(isProxied('/main.tsx')).toBe(false)
  })
})
