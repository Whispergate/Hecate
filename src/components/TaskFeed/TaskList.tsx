/* ═══════════════════════════════════════════════════
   src/components/TaskFeed/TaskList.tsx
   Compact left-pane task list — click a row to select
   ═══════════════════════════════════════════════════ */

import { memo } from 'react'
import type { Task } from '@/store'
import { KillTaskButton } from './KillTaskButton'
import styles from './TaskList.module.css'

interface Props {
  tasks:          Task[]
  selectedTaskId: number | null
  onSelect:       (id: number) => void
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

function getStatusMod(task: Task): string {
  if (task.completed || task.status === 'completed' || task.status === 'success')
    return styles.rowDone
  if (task.status.toLowerCase().includes('error'))
    return styles.rowErr
  if (task.status === 'submitted')
    return styles.rowQueued
  return styles.rowRunning
}

interface RowProps {
  task:     Task
  selected: boolean
  onSelect: (id: number) => void
}

const TaskRow = memo(function TaskRow({ task, selected, onSelect }: RowProps) {
  const isRunning = !task.completed && !task.status.toLowerCase().includes('error')
  const statusMod = getStatusMod(task)

  const displayArgs = (task.display_params && task.display_params !== '{}' && task.display_params !== '')
    ? task.display_params
    : task.params || ''

  return (
    <button
      className={`${styles.row} ${statusMod} ${selected ? styles.rowSelected : ''}`}
      onClick={() => onSelect(task.id)}
    >
      {/* Status indicator */}
      <span className={`${styles.dot} ${statusMod} ${isRunning ? styles.dotPulse : ''}`} />

      {/* Command */}
      <span className={styles.rowBody}>
        <span className={styles.rowCmd}>{task.command_name}</span>
        {displayArgs && (
          <span className={styles.rowArgs}> {displayArgs}</span>
        )}
      </span>

      {/* Right: kill + time + id */}
      <span className={styles.rowRight}>
        {!task.completed && <KillTaskButton task={task} />}
        <span className={styles.rowTime}>{formatTime(task.timestamp)}</span>
        <span className={styles.rowId}>#{task.display_id}</span>
      </span>
    </button>
  )
}, (prev, next) =>
  prev.selected      === next.selected      &&
  prev.task.id       === next.task.id       &&
  prev.task.status   === next.task.status   &&
  prev.task.completed=== next.task.completed
)

export function TaskList({ tasks, selectedTaskId, onSelect }: Props) {
  if (tasks.length === 0) {
    return (
      <div className={styles.empty}>
        No tasks yet
      </div>
    )
  }

  return (
    <div className={styles.list}>
      {tasks.map(task => (
        <TaskRow
          key={task.id}
          task={task}
          selected={task.id === selectedTaskId}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
