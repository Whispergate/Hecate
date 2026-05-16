// Upload a single file to Mythic, return the resulting agent_file_id (UUID)
// or null on failure. Used for command file params and payload build/c2 file
// params.

export async function uploadTaskFile(file: File, token: string, comment = 'Uploaded via Hecate'): Promise<string | null> {
  const form = new FormData()
  form.append('file', file)
  form.append('comment', comment)

  try {
    const res = await fetch('/api/v1.4/task_upload_file_webhook', {
      method:  'POST',
      body:    form,
      headers: {
        Authorization: `Bearer ${token}`,
        MythicSource:  'web',
      },
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data?.agent_file_id as string | undefined) ?? null
  } catch {
    return null
  }
}
