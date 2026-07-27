import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import type { RichDoc, StoryNode } from '../model/types'

interface Props {
  node: StoryNode
  /** Кладёт текст в очередь сохранения — паузой и записью заведует хранилище. */
  onChangeDoc: (doc: RichDoc) => void
  onChangeTitle: (title: string) => void
  onFocus: () => void
}

export function SceneEditor({ node, onChangeDoc, onChangeTitle, onFocus }: Props) {
  const editor = useEditor(
    {
      extensions: [StarterKit, Placeholder.configure({ placeholder: 'Пиши сцену…' })],
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
      <EditorContent editor={editor} className="scene__body" />
    </article>
  )
}
