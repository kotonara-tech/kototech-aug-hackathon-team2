/**
 * デモ専用APIエントリーポイント。
 * 通常開発中の8787番APIや永続DBと混線しないよう、専用ポートとインメモリDBを使う。
 */
process.env.PORT = '8790'
process.env.DB_PATH = ':memory:'

await import('./index.js')

export {}
