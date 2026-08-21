/**
 * 活動報告に添付する写真の保存・配信（server 層の I/O）。
 *
 * ドメイン層（domain/photo.ts）の検証を通した後のデータをディスクへ書き込み・
 * 読み出しする。payment-service.ts と同じ立ち位置（I/O を伴う処理をここへ集約する）。
 *
 * 保存先ディレクトリは呼び出しのたびに解決する（モジュール読み込み時に固定しない）。
 * テストが `NARA_CLEAN_PHOTO_DIR` に一時ディレクトリを差し込めるようにするため。
 */

/** 保存先ディレクトリを解決する（呼び出し時に毎回評価する） */
function photoDir(): string {
  return process.env.NARA_CLEAN_PHOTO_DIR ?? 'data/photos'
}

/** data URL の配列を検証して保存し、配信用の URL 配列を返す */
export function savePhotos(activityId: string, dataUrls: string[]): string[] {
  // TODO: Green フェーズで実装する
  void photoDir()
  void activityId
  void dataUrls
  return []
}

/** 保存済みの写真を読み出す */
export function readPhoto(activityId: string, fileName: string): { bytes: Uint8Array; mime: string } | null {
  // TODO: Green フェーズで実装する
  void photoDir()
  void activityId
  void fileName
  return null
}
