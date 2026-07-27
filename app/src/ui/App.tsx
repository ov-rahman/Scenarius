import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { FactsPanel } from './FactsPanel'
import { Graph } from './Graph'
import { Ribbon } from './Ribbon'

export function App() {
  const ready = useStore((s) => s.ready)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const projectId = useStore((s) => s.projectId)
  const projects = useStore((s) => s.projects)
  const init = useStore((s) => s.init)
  const closeProject = useStore((s) => s.closeProject)
  const viewMode = useStore((s) => s.viewMode)
  const setViewMode = useStore((s) => s.setViewMode)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Вкладку закрывают и прячут внезапно — дописываем несохранённое, пока можем.
  useEffect(() => {
    const flush = () => void useStore.getState().flushDocs()
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  if (!ready) return <div className="loading">Загрузка…</div>

  const project = projects.find((p) => p.id === projectId)

  return (
    <div className="app">
      <header className="topbar">
        {project ? (
          <button type="button" className="topbar__back" onClick={closeProject}>
            ← проекты
          </button>
        ) : (
          <span className="topbar__brand">Сценариус</span>
        )}
        <h1 className="topbar__title">{project?.title ?? 'Проекты'}</h1>
        <button
          type="button"
          className="topbar__theme"
          onClick={() => void setTheme(theme === 'light' ? 'dark' : 'light')}
          aria-label="Переключить тему"
        >
          {theme === 'light' ? '◐' : '◑'}
        </button>
      </header>

      <main className={`content${viewMode === 'graph' && projectId ? ' content--full' : ''}`}>
        {!projectId && <ProjectList />}
        {projectId && viewMode === 'graph' && <Graph />}
        {projectId && viewMode === 'write' && (
          <div className="workspace">
            <Ribbon />
            <FactsPanel />
          </div>
        )}
      </main>

      {projectId && (
        <nav className="modes">
          <button
            type="button"
            className={viewMode === 'write' ? 'is-on' : ''}
            onClick={() => setViewMode('write')}
          >
            письмо
          </button>
          <button
            type="button"
            className={viewMode === 'graph' ? 'is-on' : ''}
            onClick={() => setViewMode('graph')}
          >
            структура
          </button>
        </nav>
      )}
    </div>
  )
}

function ProjectList() {
  const projects = useStore((s) => s.projects)
  const createProject = useStore((s) => s.createProject)
  const openProject = useStore((s) => s.openProject)
  const [title, setTitle] = useState('')

  return (
    <div className="projects">
      <form
        className="projects__new"
        onSubmit={(event) => {
          event.preventDefault()
          void createProject(title)
          setTitle('')
        }}
      >
        <input
          value={title}
          placeholder="Название игры"
          onChange={(event) => setTitle(event.target.value)}
        />
        <button type="submit">Создать проект</button>
      </form>

      <ul className="projects__list">
        {projects.map((project) => (
          <li key={project.id}>
            <button type="button" onClick={() => void openProject(project.id)}>
              {project.title}
            </button>
          </li>
        ))}
      </ul>

      {projects.length === 0 && (
        <p className="projects__hint">
          Пока пусто. Создай проект — в нём сразу появится основная линия и первая
          сцена.
        </p>
      )}
    </div>
  )
}
