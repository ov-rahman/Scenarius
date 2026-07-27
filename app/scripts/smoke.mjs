/**
 * Проверка ленты письма в настоящем браузере: создать проект, написать текст,
 * добавить сцену и развилку, переключить ветку, перезагрузить и убедиться,
 * что всё сохранилось.
 *
 *   npx vite preview --port 4173 &
 *   node scripts/smoke.mjs
 */
import { chromium } from 'playwright-core'

const URL = process.env.SMOKE_URL ?? 'http://localhost:4173/'
const EXECUTABLE =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const failures = []
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures.push(`${name}: ожидалось ${expected}, получено ${actual}`)
  console.log(`${ok ? '✓' : '✗'} ${name}`)
}

const browser = await chromium.launch({ executablePath: EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })

const consoleErrors = []
page.on('pageerror', (e) => consoleErrors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))

await page.goto(URL, { waitUntil: 'networkidle' })

await page.fill('.projects__new input', 'Подземелье')
await page.click('.projects__new button')
await page.waitForSelector('.scene')
check('проект создан с первой сценой', await page.locator('.scene').count(), 1)

await page.click('.scene__body .tiptap')
await page.keyboard.type('Ты просыпаешься в цветах.')

// Плюсик в конце ленты дописывает сцену следом.
await page.locator('.inserter').first().hover()
await page.locator('.inserter').first().getByText('+ сцена').click()
await page.waitForFunction(() => document.querySelectorAll('.scene').length === 2)
check('плюсик добавил сцену', await page.locator('.scene').count(), 2)

// Развилка из первой сцены: вторая ветка ленту не удлиняет, но даёт переключатель.
await page.locator('.inserter').first().hover()
await page.locator('.inserter').first().getByText('+ развилка').click()
await page.waitForSelector('.branches__switch')
check('лента осталась на выбранной ветке', await page.locator('.scene').count(), 2)
check(
  'переключатель показывает 1 из 2',
  (await page.locator('.branches__label').first().innerText()).replace(/\s+/g, ' '),
  'Ветка 11/2',
)

await page.locator('.branches__switch button').last().click()
check(
  'ветка переключилась',
  (await page.locator('.branches__label').first().innerText()).replace(/\s+/g, ' '),
  'Ветка 22/2',
)

await page.click('.topbar__theme')
check('тёмная тема включилась', await page.evaluate(() => document.documentElement.dataset.theme), 'dark')

await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.scene')
check(
  'текст пережил перезагрузку',
  (await page.locator('.scene__body').first().innerText()).trim(),
  'Ты просыпаешься в цветах.',
)
check(
  'тема пережила перезагрузку',
  await page.evaluate(() => document.documentElement.dataset.theme),
  'dark',
)
check(
  'выбранная ветка пережила перезагрузку',
  (await page.locator('.branches__label').first().innerText()).replace(/\s+/g, ' '),
  'Ветка 22/2',
)

// ─── Режим структуры ─────────────────────────────────────────────────────────

await page.click('.modes button:has-text("структура")')
await page.waitForSelector('.react-flow__node')
await page.waitForTimeout(600)
check('на графе три сцены', await page.locator('.react-flow__node').count(), 3)
check('на графе две связи', await page.locator('.react-flow__edge').count(), 2)

// Двойной клик уводит в письмо на этой сцене. Проверка не косметическая:
// подсветка фокуса когда-то пересобирала список узлов между кликами,
// и второй клик пропадал.
await page.locator('.gnode').first().dblclick()
await page.waitForTimeout(400)
check(
  'двойной клик увёл в письмо',
  await page.locator('.modes button.is-on').innerText(),
  'письмо',
)

check('ошибок в консоли нет', consoleErrors, [])

await browser.close()

if (failures.length > 0) {
  console.error('\n' + failures.join('\n'))
  process.exit(1)
}
console.log('\nВсё сошлось.')
