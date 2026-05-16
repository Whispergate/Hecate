/* hecate/src/components/TaskFeed/KillTaskButton.tsx */

import { useState } from 'react'
import { useLazyQuery, useMutation } from '@apollo/client'
import { GET_JOB_KILL_COMMAND, CREATE_TASK } from '@/apollo/operations'
import type { Task } from '@/store'
import styles from './KillTaskButton.module.css'

interface Props { task: Task }

export function KillTaskButton({ task }: Props) {
  const [confirm, setConfirm] = useState(false)

  const [getKillCmd] = useLazyQuery<{
    loadedcommands: Array<{ command: { cmd: string } }>
  }>(GET_JOB_KILL_COMMAND)

  const [createTask] = useMutation(CREATE_TASK)

  const handleKill = async () => {
    const { data } = await getKillCmd({ variables: { callback_id: task.callback.id } })
    const cmd = data?.loadedcommands[0]?.command.cmd
    if (!cmd) return
    createTask({ variables: {
      callback_id:      task.callback.display_id,
      command:          cmd,
      params:           task.agent_task_id,
      tasking_location: 'command_line',
    }})
  }

  if (confirm) {
    return (
      <span className={styles.confirm}>
        <button className={styles.btnYes} onClick={(e) => { e.stopPropagation(); handleKill(); setConfirm(false) }}>kill</button>
        <button className={styles.btnNo}  onClick={(e) => { e.stopPropagation(); setConfirm(false) }}>✕</button>
      </span>
    )
  }

  return (
    <button
      className={styles.btn}
      title="Kill task"
      onClick={(e) => { e.stopPropagation(); setConfirm(true) }}
    >
      ✕
    </button>
  )
}
