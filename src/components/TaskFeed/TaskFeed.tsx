/* ═══════════════════════════════════════════════════
   src/components/TaskFeed/TaskFeed.tsx
   ═══════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react'
import { useSubscription }              from '@apollo/client'
import { SUB_TASKS }                    from '@/apollo/operations'
import { useStore }                     from '@/store'
import type { Task }                    from '@/store'
import { TaskList }                     from './TaskList'
import { TaskOutputPanel }              from './TaskOutputPanel'
import { ConsoleView }                  from './ConsoleView'
import { FileBrowserPanel }             from './FileBrowserPanel'
import styles                           from './TaskFeed.module.css'

type ViewMode = 'feed' | 'console' | 'browser'

export function TaskFeed() {
  const selectedCallbackId = useStore((s) => s.selectedCallbackId)
  const callbacks          = useStore((s) => s.callbacks)
  const setCurrentTasks    = useStore((s) => s.setCurrentTasks)

  const selectedCb         = callbacks.find(c => c.id === selectedCallbackId)
  const callbackDisplayId  = selectedCb?.display_id ?? 0
  const [viewMode, setViewMode]         = useState<ViewMode>('feed')
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)

  const { data, loading } = useSubscription(SUB_TASKS, {
    variables: { callback_id: selectedCallbackId ?? 0, limit: 100 },
    skip: !selectedCallbackId,
  })

  const tasks: Task[] = data?.task ?? []

  // Sync tasks to store
  const setTasksRef = useRef(setCurrentTasks)
  setTasksRef.current = setCurrentTasks
  useEffect(() => { setTasksRef.current(tasks) }, [tasks])

  // Auto-select: prefer the newest running task, otherwise the first (newest) task
  const prevTaskCountRef = useRef(0)
  useEffect(() => {
    if (tasks.length === 0) return

    // On first load, or when a new task arrives — auto-select
    const newTask = tasks.length > prevTaskCountRef.current
    prevTaskCountRef.current = tasks.length

    if (newTask || selectedTaskId === null) {
      const running = tasks.find(t => !t.completed && !t.status.toLowerCase().includes('error'))
      setSelectedTaskId(running?.id ?? tasks[0].id)
    }
  }, [tasks.length])

  // Reset when switching callback
  useEffect(() => {
    setSelectedTaskId(null)
    prevTaskCountRef.current = 0
  }, [selectedCallbackId])

  if (!selectedCallbackId) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>⬡</span>
        <div>Select a callback to view tasks</div>
      </div>
    )
  }

  if (loading && tasks.length === 0) {
    return <div className={styles.loading}>Loading task feed…</div>
  }

  const running   = tasks.filter(t => !t.completed && !t.status.toLowerCase().includes('error')).length
  const completed = tasks.filter(t => t.completed || t.status === 'completed' || t.status === 'success').length
  const errors    = tasks.filter(t => t.status.toLowerCase().includes('error')).length

  const selectedTask = tasks.find(t => t.id === selectedTaskId) ?? null

  return (
    <div className={styles.feedRoot}>
      {/* ── Bar ── */}
      <div className={styles.feedBar}>
        <span className={styles.feedCount}>{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
        {tasks.length > 0 && <>
          <span className={styles.feedSep}>·</span>
          {completed > 0 && <span className={styles.feedDone}>{completed} done</span>}
          {running   > 0 && <><span className={styles.feedSep}>·</span><span className={styles.feedRun}>{running} running</span></>}
          {errors    > 0 && <><span className={styles.feedSep}>·</span><span className={styles.feedErr}>{errors} err</span></>}
        </>}
        <span className={styles.feedSpacer} />
        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewBtn} ${viewMode === 'feed' ? styles.viewBtnActive : ''}`}
            onClick={() => setViewMode('feed')}
            title="Split feed view"
          >
            ⊞ feed
          </button>
          <button
            className={`${styles.viewBtn} ${viewMode === 'console' ? styles.viewBtnActive : ''}`}
            onClick={() => setViewMode('console')}
            title="Console view"
          >
            ▮ console
          </button>
          <button
            className={`${styles.viewBtn} ${viewMode === 'browser' ? styles.viewBtnActive : ''}`}
            onClick={() => setViewMode('browser')}
            title="File browser"
          >
            ⊟ files
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      {viewMode === 'browser' ? (
        <FileBrowserPanel
          key={selectedCallbackId ?? 0}
          callbackId={selectedCallbackId ?? 0}
          callbackDisplayId={callbackDisplayId}
        />
      ) : viewMode === 'console' ? (
        <ConsoleView tasks={tasks} />
      ) : (
        <div className={styles.splitPane}>
          {tasks.length === 0 ? (
            <div className={styles.noTasks}>No tasks yet — issue a command below</div>
          ) : (
            <>
              <div className={styles.listPane}>
                <TaskList
                  tasks={tasks}
                  selectedTaskId={selectedTaskId}
                  onSelect={setSelectedTaskId}
                />
              </div>
              <TaskOutputPanel task={selectedTask} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
