import { useEffect, useState } from 'react'

/**
 * Тач-устройство определяем по отсутствию наведения, а не по ширине экрана:
 * узкое окно на ноутбуке — всё ещё мышь, и прятать от него перетаскивание узлов
 * незачем.
 */
export function useTouch(): boolean {
  const [touch, setTouch] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(hover: none)').matches,
  )

  useEffect(() => {
    const query = matchMedia('(hover: none)')
    const update = () => setTouch(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return touch
}

/** Узкий экран — одноколоночная раскладка со шторкой вместо боковой панели. */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(max-width: 900px)').matches,
  )

  useEffect(() => {
    const query = matchMedia('(max-width: 900px)')
    const update = () => setNarrow(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return narrow
}
