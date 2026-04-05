/* ═══════════════════════════════════════════════════
   hecate/src/components/TaskFeed/TaskFeed.tsx
   ═══════════════════════════════════════════════════ */

import { useSubscription } from '@apollo/client'
import { SUB_TASKS }       from '@/apollo/operations'
import { useStore }        from '@/store'
import { TaskBlock }       from './TaskBlock'
import styles              from './TaskFeed.module.css'

export function TaskFeed() {
  const { selectedCallbackId, activeOperation } = useStore()

  const { data, loading } = useSubscription(SUB_TASKS, {
    variables: { callback_id: selectedCallbackId ?? 0, limit: 50 },
    skip: !selectedCallbackId,
  })

  const tasks = data?.task ?? []

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
      {/* Newest first */}
      {[...tasks].map((task) => (
        <TaskBlock key={task.id} task={task} />
      ))}
    </div>
  )
}
