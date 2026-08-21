/**
 * 永続化層。Node 24 標準の node:sqlite を使うためネイティブ依存がなく、
 * 開発環境の構築コストを下げている（自治体側の運用を想定）。
 *
 * ドメインオブジェクトは JSON 列にそのまま保存し、検索に使う項目だけを
 * 独立した列に切り出している。ドメインの型定義とスキーマが二重管理にならない。
 */
import { DatabaseSync } from 'node:sqlite'

const DDL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS wards (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  lat   REAL NOT NULL,
  lng   REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  contact       TEXT NOT NULL DEFAULT '',
  total_points  INTEGER NOT NULL DEFAULT 0,
  bank_json     TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('city','group','member')),
  group_id      TEXT REFERENCES groups(id),
  age           INTEGER,
  total_points  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS activities (
  id              TEXT PRIMARY KEY,
  group_id        TEXT NOT NULL REFERENCES groups(id),
  status          TEXT NOT NULL,
  ward_id         TEXT NOT NULL,
  scheduled_date  TEXT NOT NULL,
  data            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
CREATE INDEX IF NOT EXISTS idx_activities_group ON activities(group_id);

CREATE TABLE IF NOT EXISTS payments (
  id           TEXT PRIMARY KEY,
  group_id     TEXT NOT NULL REFERENCES groups(id),
  activity_id  TEXT NOT NULL REFERENCES activities(id),
  status       TEXT NOT NULL,
  fiscal_year  INTEGER NOT NULL,
  data         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id        TEXT PRIMARY KEY,
  group_id  TEXT NOT NULL REFERENCES groups(id),
  starts_at TEXT NOT NULL,
  data      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendances (
  event_id   TEXT NOT NULL REFERENCES events(id),
  member_id  TEXT NOT NULL REFERENCES users(id),
  points     INTEGER NOT NULL,
  awarded_at TEXT NOT NULL,
  PRIMARY KEY (event_id, member_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id         TEXT PRIMARY KEY,
  group_id   TEXT REFERENCES groups(id),
  created_at TEXT NOT NULL,
  data       TEXT NOT NULL
);
`

export function createDb(path = 'data/nara-clean.db'): DatabaseSync {
  const db = new DatabaseSync(path)
  db.exec(DDL)
  return db
}

export type { DatabaseSync }
