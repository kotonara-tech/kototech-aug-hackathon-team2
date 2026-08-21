import { mkdirSync } from 'node:fs'
import { createDb } from '../db/schema.js'
import { Repo } from '../db/repo.js'
import { seedBaseline, seedDemo } from '../db/seed.js'
import { createApp } from './app.js'

const PORT = Number(process.env.PORT ?? 8787)
const DB_PATH = process.env.DB_PATH ?? 'data/nara-clean.db'

mkdirSync('data', { recursive: true })

const repo = new Repo(createDb(DB_PATH))

// 初回起動時のみデモデータを投入する
if (repo.listGroups().length === 0) {
  seedBaseline(repo)
  seedDemo(repo)
  console.log('デモデータを投入しました')
}

createApp(repo).listen(PORT, () => {
  console.log(`奈良クリーンアップ API: http://localhost:${PORT}/api/health`)
})
