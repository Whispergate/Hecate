/* ═══════════════════════════════════════════════════
   hecate/src/components/TaskFeed/TaskFeed.tsx
   ═══════════════════════════════════════════════════ */

import { useSubscription } from '@apollo/client'
import { SUB_TASKS }       from '@/apollo/operations'
import { useStore }        from '@/store'
import { TaskBlock }       from './TaskBlock'
import styles              from './TaskFeed.module.css'

export function TaskFeed() {
  const { selectedCallbackId } = useStore()

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

  const running   = tasks.filter((t: any) => t.status !== 'completed' && t.status !== 'error').length
  const completed = tasks.filter((t: any) => t.status === 'completed').length
  const errors    = tasks.filter((t: any) => t.status === 'error').length

  return (
    <div className={styles.feedRoot}>
      {/* Feed-level status bar */}
      {tasks.length > 0 && (
        <div className={styles.feedBar}>
          <span className={styles.feedCount}>{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
          <span className={styles.feedSep}>·</span>
          {completed > 0 && <span className={styles.feedDone}>{completed} done</span>}
          {running   > 0 && <span className={styles.feedRun}>{running} running</span>}
          {errors    > 0 && <span className={styles.feedErr}>{errors} error{errors !== 1 ? 's' : ''}</span>}
        </div>
      )}

      <div className={styles.feed}>
        {tasks.length === 0 ? (
          <div className={styles.noTasks}>No tasks yet — issue a command below</div>
        ) : (
          // Newest first (subscription returns desc order)
          [...tasks].map((task: any) => (
            <TaskBlock key={task.id} task={task} />
          ))
        )}
      </div>
    </div>
  )
}
