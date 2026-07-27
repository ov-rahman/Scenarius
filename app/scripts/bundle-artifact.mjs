/**
 * Собирает приложение в один самодостаточный HTML-файл: стили и скрипт
 * вшиваются внутрь, внешних запросов не остаётся. Нужен, чтобы «Сценариус»
 * можно было открыть по ссылке, не поднимая сервер.
 *
 *   npx vite build && node scripts/bundle-artifact.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'
const ASSETS = join(DIST, 'assets')

const files = readdirSync(ASSETS)
const js = files.find((name) => name.endsWith('.js'))
const css = files.find((name) => name.endsWith('.css'))

if (!js) throw new Error('Не найден собранный скрипт в dist/assets')

const script = readFileSync(join(ASSETS, js), 'utf8')
const styles = css ? readFileSync(join(ASSETS, css), 'utf8') : ''

// Внутри кода может встретиться закрывающий тег в строковом литерале —
// экранируем, иначе браузер обрежет скрипт на середине.
const safeScript = script.replaceAll('</script', '<\\/script')

const html = `<title>Сценариус — редактор сюжета</title>
<style>
${styles}
</style>

<div id="root"></div>

<script type="module">
${safeScript}
</script>
`

writeFileSync(join(DIST, 'artifact.html'), html)

// Полноценный документ: его можно открыть с диска и отдать как сайт.
const page = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
${html}</body>
</html>
`

writeFileSync(join(DIST, 'scenarius.html'), page)

const kb = Math.round(Buffer.byteLength(page) / 1024)
console.log(`dist/scenarius.html — ${kb} КБ, внешних запросов нет`)
