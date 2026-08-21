/** ドメイン層の共通エラー。code で呼び出し側（API層）が HTTP ステータスに変換する。 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = new.target.name
  }
}

export const HTTP_STATUS_BY_CODE: Record<string, number> = {
  FORBIDDEN: 403,
  INVALID_STATE: 409,
  ALREADY_JOINED: 409,
  CLOSED: 409,
  NOT_JOINED: 404,
  NOT_FOUND: 404,
  VALIDATION: 400,
  EMPTY: 400,
  TOO_LONG: 400,
}
