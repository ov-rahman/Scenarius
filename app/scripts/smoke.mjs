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
  'лента перешла на новую ветку',
  (await page.locator('.branches__label').first().innerText()).replace(/\s+/g, ' '),
  'Ветка 22/2',
)

await page.locator('.branches__switch button').last().click()
check(
  'ветка переключилась',
  (await page.locator('.branches__label').first().innerText()).replace(/\s+/g, ' '),
  'Ветка 11/2',
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
  'Ветка 11/2',
)

// ─── Факты и условия ─────────────────────────────────────────────────────────

// Ключевой момент в первой сцене — он же станет условием на ветке.
await page.locator('.scene__body .tiptap').first().click()
await page.locator('.panel__add input').fill('Пощадил Папируса')
await page.locator('.panel__add button').click()
await page.waitForTimeout(300)
check('факт появился в панели', await page.locator('.panel__list li').count(), 1)

// Запрещаем факт на текущей ветке — она обязана стать недоступной.
await page.locator('.branches__edit').first().click()
await page.waitForSelector('.cond__chip')
const chip = page.locator('.branches__item').nth(1).locator('.cond__chip').first()
await chip.click()
await page.waitForTimeout(150)
await chip.click()
await page.waitForTimeout(400)
check(
  'запрет отсёк ветку',
  await page.locator('.branches__blocked').count() > 0,
  true,
)

// Панель не должна целиться в сцену, которой нет в ленте.
const target = (await page.locator('.panel__target').innerText())
  .replace('в сцене «', '')
  .replace('»', '')
const titles = await page
  .locator('.scene__title')
  .evaluateAll((els) => els.map((e) => e.value || 'без названия'))
check('цель панели видна в ленте', titles.includes(target), true)

// Задел висит, пока не привязан узел-отыгрыша.
await page.click('.panel__tabs button:has-text("заделы")')
await page.locator('.panel__add input').fill('Кто-то следит из темноты')
await page.locator('.panel__add button').click()
await page.waitForTimeout(300)
check('счётчик незакрытых заделов', await page.locator('.panel__tabs em').innerText(), '1')

// ─── Персонажи и упоминания ──────────────────────────────────────────────────

await page.click('.panel__tabs button:has-text("персонажи")')
await page.locator('.panel__add input').fill('Папирус')
await page.locator('.panel__add button').click()
await page.waitForTimeout(300)

// `@` подсказывает по началу имени и вставляет ссылку, а не голый текст.
await page.locator('.scene__body .tiptap').first().click()
await page.keyboard.press('End')
await page.keyboard.type(' Навстречу выбегает @Пап')
await page.waitForTimeout(400)
check('подсказка нашла персонажа', await page.locator('.mention-menu__item').count(), 1)
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
check('упоминание вставилось', await page.locator('.mention').count(), 1)

// Знание в первой сцене — персонаж обязан знать его здесь и не знать раньше.
await page.click('.panel__tabs button:has-text("знания")')
await page.locator('.scene__body .tiptap').first().click()
await page.locator('.panel__add input').fill('Что человек не опасен')
await page.locator('.panel__add button').click()
await page.waitForTimeout(300)
await page.locator('.panel__list select').first().selectOption({ label: 'Папирус' })
await page.waitForTimeout(400)

await page.locator('.mention').first().click()
await page.waitForSelector('.card')
check('карточка знает факт этой сцены', await page.locator('.card__facts li.is-known').count(), 1)
await page.click('.topbar__title')
await page.waitForTimeout(200)
check('карточка закрылась по клику мимо', await page.locator('.card').count(), 0)

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
