import Mention from '@tiptap/extension-mention'
import type { SuggestionOptions } from '@tiptap/suggestion'
import { useStore } from '../store/useStore'

/**
 * Упоминание персонажа через `@`. В документе хранится идентификатор, а не имя:
 * персонажа можно переименовать, и текст не рассыплется.
 *
 * Подсказка нарисована вручную, без всплывающих библиотек — список короткий,
 * а лишняя зависимость тянула бы за собой позиционирование и порталы.
 */
const suggestion: Omit<SuggestionOptions, 'editor'> = {
  char: '@',

  items({ query }) {
    const characters = useStore.getState().characters
    const needle = query.trim().toLowerCase()

    return characters
      .filter((character) => {
        if (!needle) return true
        const names = [character.name, ...character.aliases]
        return names.some((name) => name.toLowerCase().includes(needle))
      })
      .slice(0, 8)
  },

  render() {
    let box: HTMLDivElement | null = null
    let items: Array<{ id: string; name: string }> = []
    let picked = 0
    let onPick: ((item: { id: string; name: string }) => void) | null = null

    const draw = () => {
      if (!box) return
      box.innerHTML = ''

      if (items.length === 0) {
        const empty = document.createElement('p')
        empty.className = 'mention-menu__empty'
        empty.textContent = 'Такого персонажа пока нет'
        box.append(empty)
        return
      }

      items.forEach((item, index) => {
        const row = document.createElement('button')
        row.type = 'button'
        row.className = `mention-menu__item${index === picked ? ' is-on' : ''}`
        row.textContent = item.name
        row.addEventListener('mousedown', (event) => {
          event.preventDefault()
          onPick?.(item)
        })
        box!.append(row)
      })
    }

    const place = (rect: DOMRect | null) => {
      if (!box || !rect) return
      box.style.left = `${rect.left}px`
      box.style.top = `${rect.bottom + 4}px`
    }

    return {
      onStart(props) {
        items = props.items as typeof items
        picked = 0
        onPick = (item) => props.command({ id: item.id, label: item.name })

        box = document.createElement('div')
        box.className = 'mention-menu'
        document.body.append(box)
        draw()
        place(props.clientRect?.() ?? null)
      },

      onUpdate(props) {
        items = props.items as typeof items
        picked = 0
        onPick = (item) => props.command({ id: item.id, label: item.name })
        draw()
        place(props.clientRect?.() ?? null)
      },

      onKeyDown(props) {
        if (props.event.key === 'Escape') {
          box?.remove()
          box = null
          return true
        }
        if (items.length === 0) return false

        if (props.event.key === 'ArrowDown') {
          picked = (picked + 1) % items.length
          draw()
          return true
        }
        if (props.event.key === 'ArrowUp') {
          picked = (picked - 1 + items.length) % items.length
          draw()
          return true
        }
        if (props.event.key === 'Enter') {
          onPick?.(items[picked])
          return true
        }
        return false
      },

      onExit() {
        box?.remove()
        box = null
      },
    }
  },
}

export const CharacterMention = Mention.configure({
  suggestion,
  HTMLAttributes: { class: 'mention' },
  renderText: ({ node }) => `@${node.attrs.label ?? ''}`,
})
