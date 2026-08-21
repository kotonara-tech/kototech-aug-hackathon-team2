import { describe, it, expect } from 'vitest'
import {
  decodePhotoDataUrl,
  assertPhotoCount,
  isSafePhotoFileName,
  MAX_PHOTOS_PER_REPORT,
  MAX_PHOTO_BYTES,
} from '@/domain/photo'
/** JPEG のマジックバイト（先頭3バイト）に適当なペイロードを続けたバイト列を作る */
const jpegBytes = (payloadLength = 16): Uint8Array => {
  const bytes = new Uint8Array(3 + payloadLength)
  bytes.set([0xff, 0xd8, 0xff], 0)
  for (let i = 0; i < payloadLength; i++) bytes[3 + i] = i % 256
  return bytes
}

/** PNG のマジックバイト（先頭8バイト）に適当なペイロードを続けたバイト列を作る */
const pngBytes = (payloadLength = 16): Uint8Array => {
  const bytes = new Uint8Array(8 + payloadLength)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  for (let i = 0; i < payloadLength; i++) bytes[8 + i] = i % 256
  return bytes
}

/** どちらのマジックバイトにも一致しないランダムなバイト列を作る */
const junkBytes = (length = 16): Uint8Array => {
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i++) bytes[i] = (i * 7 + 1) % 256
  return bytes
}

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64')
const toDataUrl = (mime: string, bytes: Uint8Array): string => `data:${mime};base64,${toBase64(bytes)}`

describe('decodePhotoDataUrl', () => {
  it('正常な JPEG の data URL をデコードできる', () => {
    const bytes = jpegBytes()
    const decoded = decodePhotoDataUrl(toDataUrl('image/jpeg', bytes))
    expect(decoded.mime).toBe('image/jpeg')
    expect(decoded.bytes).toEqual(bytes)
  })

  it('正常な PNG の data URL をデコードできる', () => {
    const bytes = pngBytes()
    const decoded = decodePhotoDataUrl(toDataUrl('image/png', bytes))
    expect(decoded.mime).toBe('image/png')
    expect(decoded.bytes).toEqual(bytes)
  })

  it('data URL の形式が不正な文字列は VALIDATION エラーになる', () => {
    expect(() => decodePhotoDataUrl('hello')).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
    expect(() => decodePhotoDataUrl('data:image/jpeg,notbase64')).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' }),
    )
  })

  it('許可外の MIME（image/gif）は VALIDATION エラーになる', () => {
    expect(() => decodePhotoDataUrl(toDataUrl('image/gif', jpegBytes()))).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' }),
    )
  })

  it('SVG はスクリプトを埋め込めるため明示的に拒否する（VALIDATION）', () => {
    expect(() => decodePhotoDataUrl(toDataUrl('image/svg+xml', jpegBytes()))).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' }),
    )
  })

  it('宣言した MIME が image/jpeg でも中身が PNG のバイト列なら VALIDATION エラーになる', () => {
    // 拡張子・MIME を詐称して別形式のファイルを紛れ込ませることを防ぐ
    expect(() => decodePhotoDataUrl(toDataUrl('image/jpeg', pngBytes()))).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' }),
    )
  })

  it('先頭がどちらの画像形式のマジックバイトとも一致しないバイト列は VALIDATION エラーになる', () => {
    expect(() => decodePhotoDataUrl(toDataUrl('image/jpeg', junkBytes()))).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' }),
    )
  })

  it('MAX_PHOTO_BYTES ちょうどのサイズは受け付ける（境界値）', () => {
    const bytes = jpegBytes(MAX_PHOTO_BYTES - 3)
    expect(bytes.length).toBe(MAX_PHOTO_BYTES)
    const decoded = decodePhotoDataUrl(toDataUrl('image/jpeg', bytes))
    expect(decoded.bytes.length).toBe(MAX_PHOTO_BYTES)
  })

  it('MAX_PHOTO_BYTES を1バイトでも超えると TOO_LARGE エラーになる', () => {
    const bytes = jpegBytes(MAX_PHOTO_BYTES - 3 + 1)
    expect(bytes.length).toBe(MAX_PHOTO_BYTES + 1)
    expect(() => decodePhotoDataUrl(toDataUrl('image/jpeg', bytes))).toThrowError(
      expect.objectContaining({ code: 'TOO_LARGE' }),
    )
  })
})

describe('assertPhotoCount', () => {
  it('0枚は VALIDATION エラーになる（最低1枚は必須）', () => {
    expect(() => assertPhotoCount(0)).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
  })

  it('MAX_PHOTOS_PER_REPORT 枚ちょうどは通る（境界値）', () => {
    expect(() => assertPhotoCount(MAX_PHOTOS_PER_REPORT)).not.toThrow()
  })

  it('MAX_PHOTOS_PER_REPORT を1枚でも超えると VALIDATION エラーになる', () => {
    expect(() => assertPhotoCount(MAX_PHOTOS_PER_REPORT + 1)).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' }),
    )
  })
})

describe('isSafePhotoFileName', () => {
  it('通常のファイル名は安全と判定する', () => {
    expect(isSafePhotoFileName('a1b2c3.jpg')).toBe(true)
  })

  it.each([
    ['../secret.jpg', '親ディレクトリへのパストラバーサル（スラッシュ）'],
    ['..\\secret.jpg', '親ディレクトリへのパストラバーサル（バックスラッシュ）'],
    ['sub/dir.jpg', 'サブディレクトリ区切りを含む'],
    ['.hidden', 'ドットファイル'],
    ['', '空文字列'],
  ])('%s は安全でないと判定する（%s）', (name) => {
    // data/photos/ の外を読み書きさせない（パストラバーサル対策）ための検証
    expect(isSafePhotoFileName(name)).toBe(false)
  })
})
