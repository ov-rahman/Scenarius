import type { Editor } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Conditional } from './conditional'
import { CharacterMention } from './mention'
import type { RichDoc, StoryNode } from '../model/types'

interface Props {
  node: StoryNode
  /** Кладёт текст в очередь сохранения — паузой и записью заведует хранилище. */
  onChangeDoc: (doc: RichDoc) => void
  onChangeTitle: (title: string) => void
  onFocus: () => void
}

/*
 * После действия схлопываем выделение: иначе всплывающее меню продолжает
 * висеть над только что созданным блоком и закрывает его настройки.
 */
function collapse(editor: Editor) {
  editor.commands.setTextSelection(editor.state.selection.to)
}

export function SceneEditor({ node, onChangeDoc, onChangeTitle, onFocus }: Props) {
  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: 'Пиши сцену…' }),
        CharacterMention,
        Conditional.configure({ sceneId: node.id }),
      ],
      content: node.doc,
      onFocus,
      onUpdate({ editor }) {
        onChangeDoc(editor.getJSON() as RichDoc)
      },
    },
    // Пересоздаём редактор только при смене сцены: иначе каждое нажатие клавиши
    // поднимало бы новый экземпляр и курсор прыгал бы в начало.
    [node.id],
  )

  return (
    <article className="scene">
      <input
        className="scene__title"
        value={node.title}
        placeholder="Название сцены"
        onChange={(event) => onChangeTitle(event.target.value)}
        onFocus={onFocus}
      />
      {editor && (
        <BubbleMenu editor={editor} className="bubble">
          <button
            type="button"
            onClick={() => {
              editor.chain().focus().wrapInConditional().run()
              collapse(editor)
            }}
          >
            сделать условным
          </button>
          <button
            type="button"
            onClick={() => {
              editor.chain().focus().liftConditional().run()
              collapse(editor)
            }}
          >
            снять условие
          </button>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} className="scene__body" />
    </article>
  )
}
