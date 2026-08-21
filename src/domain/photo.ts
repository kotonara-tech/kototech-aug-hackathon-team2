/**
 * 活動報告に添付する写真の検証（ドメイン層）。
 * ここは純粋関数のみを置く。ファイル保存など I/O は行わない（`node:fs` を import しない）。
 * data URL のデコード・MIME/マジックバイト検証・枚数検証・
 * ファイル名のパストラバーサル検証を行う。
 */
import { DomainError } from './errors.js'

/** 1回の活動報告に添付できる写真の上限枚数 */
export const MAX_PHOTOS_PER_REPORT = 4
/** 圧縮後の1枚あたりの上限バイト数 */
export const MAX_PHOTO_BYTES = 500_000
/** 受け付ける画像形式 */
export const ALLOWED_PHOTO_MIMES = ['image/jpeg', 'image/png'] as const

export type PhotoMime = (typeof ALLOWED_PHOTO_MIMES)[number]

export interface DecodedPhoto {
  mime: PhotoMime
  bytes: Uint8Array
}

export class PhotoError extends DomainError {}

/** data:<mime>;base64,<data> 形式にのみマッチする。mime・base64本体を取り出す */
const DATA_URL_PATTERN = /^data:([a-zA-Z0-9!#$&.+\-^_]+\/[a-zA-Z0-9!#$&.+\-^_]+);base64,([A-Za-z0-9+/=]*)$/

/** MIME ごとの先頭マジックバイト */
const MAGIC_BYTES: Record<PhotoMime, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
}

/** 安全なファイル名として許可する文字（英数字・ハイフン・アンダースコア + 拡張子）のみを許可する */
const SAFE_FILE_NAME_PATTERN = /^[A-Za-z0-9_-]+\.(jpg|jpeg|png)$/

/** data URL 形式の画像を検証してデコードする（形式 → MIME許可 → デコード → マジックバイト → サイズ の順） */
export function decodePhotoDataUrl(dataUrl: string): DecodedPhoto {
  // 1. 形式: data:<mime>;base64,<data> になっているか
  const match = DATA_URL_PATTERN.exec(dataUrl)
  if (!match) {
    throw new PhotoError('VALIDATION', '写真の形式が不正です。data URL 形式（data:image/jpeg;base64,...）で送信してください')
  }
  // DATA_URL_PATTERN の2つのグループは省略可能ではないため、マッチした時点で両方とも存在する
  const mime = match[1] ?? ''
  const base64 = match[2] ?? ''

  // 2. MIME 許可: 拡張子偽装対策として許可リストのみ通す（SVG 等は明示的に拒否される）
  if (!isAllowedPhotoMime(mime)) {
    throw new PhotoError('VALIDATION', `対応していない画像形式です（${mime}）。JPEG または PNG を使用してください`)
  }

  // 3. デコード: 不正な base64（無視される不正文字を含むもの）を弾くため、再エンコードして一致を確認する
  const bytes = decodeStrictBase64(base64)
  if (!bytes) {
    throw new PhotoError('VALIDATION', '写真データの base64 エンコードが不正です')
  }

  // 4. マジックバイト照合: 宣言された MIME と中身の実体が一致するか
  if (!hasMagicBytes(bytes, MAGIC_BYTES[mime])) {
    throw new PhotoError('VALIDATION', '宣言された画像形式と実際のファイル内容が一致しません')
  }

  // 5. サイズ: 上限ちょうどまでは許可する
  if (bytes.length > MAX_PHOTO_BYTES) {
    throw new PhotoError('TOO_LARGE', `写真のサイズが上限（${MAX_PHOTO_BYTES}バイト）を超えています`)
  }

  return { mime, bytes }
}

function isAllowedPhotoMime(mime: string): mime is PhotoMime {
  return (ALLOWED_PHOTO_MIMES as readonly string[]).includes(mime)
}

/** base64 文字列を厳密にデコードする。不正文字を含む場合は null を返す */
function decodeStrictBase64(base64: string): Uint8Array | null {
  const buffer = Buffer.from(base64, 'base64')
  // Buffer.from は不正な文字を黙って無視するため、再エンコードして元の文字列と一致するか確認する
  if (buffer.toString('base64') !== base64) return null
  return new Uint8Array(buffer)
}

function hasMagicBytes(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false
  return magic.every((byte, index) => bytes[index] === byte)
}

/** 添付枚数を検証する（1枚以上 MAX_PHOTOS_PER_REPORT 枚以下） */
export function assertPhotoCount(count: number): void {
  if (count < 1 || count > MAX_PHOTOS_PER_REPORT) {
    throw new PhotoError('VALIDATION', `写真は1枚以上${MAX_PHOTOS_PER_REPORT}枚以下で添付してください`)
  }
}

/** 保存・配信に使うファイル名が安全か（パストラバーサル等が無いか）。許可リスト方式で判定する */
export function isSafePhotoFileName(name: string): boolean {
  return SAFE_FILE_NAME_PATTERN.test(name)
}
