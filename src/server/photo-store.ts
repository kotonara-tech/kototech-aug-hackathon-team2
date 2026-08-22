/**
 * 活動報告に添付する写真の保存・配信（server 層の I/O）。
 *
 * ドメイン層（domain/photo.ts）の検証を通した後のデータをディスクへ書き込み・
 * 読み出しする。payment-service.ts と同じ立ち位置（I/O を伴う処理をここへ集約する）。
 *
 * 保存先ディレクトリは呼び出しのたびに解決する（モジュール読み込み時に固定しない）。
 * テストが `NARA_CLEAN_PHOTO_DIR` に一時ディレクトリを差し込めるようにするため。
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { assertPhotoCount, decodePhotoDataUrl, isSafePhotoFileName, PhotoError, type PhotoMime } from '../domain/photo.js'

/** 保存先ディレクトリを解決する（呼び出し時に毎回評価する） */
function photoDir(): string {
  return process.env.NARA_CLEAN_PHOTO_DIR ?? 'data/photos'
}

/** MIME → 拡張子。isSafePhotoFileName の許可リストと対応させる */
const EXTENSION_BY_MIME: Record<PhotoMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

/** 拡張子 → 配信時の Content-Type */
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

/** activityId が安全な形式（UUID）か。ここを素通りさせるとパストラバーサルの入口になるため必ず検証する */
const ACTIVITY_ID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function isSafeActivityId(activityId: string): boolean {
  return ACTIVITY_ID_PATTERN.test(activityId)
}

/** ランダムなファイル名を生成し、生成後に自己検証する（許可リストを満たさなければ内部エラーとして扱う） */
function generateSafeFileName(mime: PhotoMime): string {
  const fileName = `${randomUUID().replace(/-/g, '')}.${EXTENSION_BY_MIME[mime]}`
  if (!isSafePhotoFileName(fileName)) {
    // 生成ロジックの不整合以外では起こり得ないが、多層防御として必ず自己検証する
    throw new PhotoError('VALIDATION', 'ファイル名の生成に失敗しました')
  }
  return fileName
}

/** data URL の配列を検証して保存し、配信用の URL 配列を返す */
export function savePhotos(activityId: string, dataUrls: string[]): string[] {
  if (!isSafeActivityId(activityId)) {
    throw new PhotoError('VALIDATION', '活動IDの形式が不正です')
  }
  assertPhotoCount(dataUrls.length)

  // 活動ごとにディレクトリを分ける。配信時に activityId とファイルの対応関係を
  // ディレクトリ構造で担保し、他活動の写真へ迂回できないようにするため
  const activityDir = join(photoDir(), activityId)
  mkdirSync(activityDir, { recursive: true })

  return dataUrls.map((dataUrl) => {
    const { mime, bytes } = decodePhotoDataUrl(dataUrl)
    const fileName = generateSafeFileName(mime)
    writeFileSync(join(activityDir, fileName), bytes)
    return `/api/photos/${activityId}/${fileName}`
  })
}

/** 保存済みの写真を読み出す */
export function readPhoto(activityId: string, fileName: string): { bytes: Uint8Array; mime: string } | null {
  // 読み出し前に許可リストで検証する（不正な形式なら存在確認すらせず null を返す）
  if (!isSafeActivityId(activityId) || !isSafePhotoFileName(fileName)) {
    return null
  }

  const activityDir = resolve(photoDir(), activityId)
  const filePath = resolve(activityDir, fileName)

  // 多層防御: 解決後の絶対パスが保存先ディレクトリ配下であることを再確認する
  if (!filePath.startsWith(activityDir + sep)) {
    return null
  }
  if (!existsSync(filePath)) {
    return null
  }

  const bytes = new Uint8Array(readFileSync(filePath))
  const extension = extname(fileName).slice(1).toLowerCase()
  const mime = MIME_BY_EXTENSION[extension] ?? 'application/octet-stream'
  return { bytes, mime }
}
