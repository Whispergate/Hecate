/* ═══════════════════════════════════════════════════
   hecate/src/components/TaskFeed/TaskFeed.tsx
   ═══════════════════════════════════════════════════ */

import { useEffect, useRef }  from 'react'
import { useSubscription }    from '@apollo/client'
import { SUB_TASKS }          from '@/apollo/operations'
import { useStore }           from '@/store'
import { TaskBlock }          from './TaskBlock'
import styles                 from './TaskFeed.module.css'

export function TaskFeed() {
  const selectedCallbackId = useStore((s) => s.selectedCallbackId)
  const setCurrentTasks    = useStore((s) => s.setCurrentTasks)

  // Keep a ref to setCurrentTasks so the effect never re-runs because of it
  const setTasksRef = useRef(setCurrentTasks)
  setTasksRef.current = setCurrentTasks

  const { data, loading } = useSubscription(SUB_TASKS, {
    variables: { callback_id: selectedCallbackId ?? 0, limit: 50 },
    skip: !selectedCallbackId,
  })

  const tasks = data?.task ?? []

  // Use ref to avoid infinite loop — only update store when task list actually changes
  const prevTaskCountRef = useRef(-1)
  useEffect(() => {
    if (tasks.length !== prevTaskCountRef.current) {
      prevTaskCountRef.current = tasks.length
      setTasksRef.current(tasks)
    }
  })

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

  return (
    <div className={styles.feed}>
      {tasks.length === 0 && (
        <div className={styles.noTasks}>No tasks yet — issue a command below</div>
      )}
      {[...tasks].map((task) => (
        <TaskBlock key={task.id} task={task} />
      ))}
    </div>
  )
}
