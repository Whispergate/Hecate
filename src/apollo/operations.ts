/* ═══════════════════════════════════════════════════
   hecate/src/apollo/operations.ts

   Field names verified against Mythic's actual source:
   MythicReactUI/src/components/pages/Callbacks/TaskDisplay.js
   and CallbackMutations.js
   ═══════════════════════════════════════════════════ */

import { gql } from '@apollo/client'

// ─────────────────────────────────────────────────────
// FRAGMENTS
// ─────────────────────────────────────────────────────

// Matches Mythic's taskingDataFragment fields
export const TASK_FIELDS = gql`
  fragment TaskFields on task {
    id
    display_id
    command_name
    display_params
    params
    status
    completed
    timestamp
    operator { username }
    callback {
      id
      display_id
      host
      ip
    }
    response_count
    tags { tagtype { name color } }
  }
`

export const CALLBACK_FIELDS = gql`
  fragment CallbackFields on callback {
    id
    display_id
    host
    user
    pid
    ip
    os
    architecture
    domain
    integrity_level
    sleep_info
    description
    active
    locked
    last_checkin
    init_callback
    payload { payloadtype { name } description }
    callbackc2profiles { c2profile { name } }
    operation { name }
  }
`

// ─────────────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────────────

export const GET_OPERATIONS = gql`
  query GetOperations {
    operation(order_by: { name: asc }) {
      id
      name
      complete
      admin { username }
    }
  }
`

export const GET_CALLBACKS = gql`
  ${CALLBACK_FIELDS}
  query GetCallbacks($operation_id: Int!) {
    callback(
      where: { operation_id: { _eq: $operation_id }, active: { _eq: true } }
      order_by: { last_checkin: desc }
    ) { ...CallbackFields }
  }
`

// ─────────────────────────────────────────────────────
// SUBSCRIPTIONS
// ─────────────────────────────────────────────────────

// Live callback list — sidebar shows active only, topology shows all
export const SUB_CALLBACKS = gql`
  ${CALLBACK_FIELDS}
  subscription SubCallbacks($operation_id: Int!) {
    callback(
      where: { operation_id: { _eq: $operation_id }, active: { _eq: true } }
      order_by: { last_checkin: desc }
    ) { ...CallbackFields }
  }
`

// All callbacks (including inactive) for topology
export const SUB_ALL_CALLBACKS = gql`
  ${CALLBACK_FIELDS}
  subscription SubAllCallbacks($operation_id: Int!) {
    callback(
      where: { operation_id: { _eq: $operation_id } }
      order_by: { last_checkin: desc }
    ) { ...CallbackFields }
  }
`

// Task list for a callback — note: NO responses embedded here (too expensive)
// response_count tells us if there's output to fetch
export const SUB_TASKS = gql`
  ${TASK_FIELDS}
  subscription SubTasks($callback_id: Int!, $limit: Int = 100) {
    task(
      where: { callback_id: { _eq: $callback_id } }
      order_by: { id: desc }
      limit: $limit
    ) { ...TaskFields }
  }
`

// Responses for a single task — fetched separately, streamed live
// response field contains base64-encoded output
// Column is response_text; aliased to response to match Mythic's schema.
// Cursor must be on timestamp (Hasura streaming requirement — id cursor rejected).
export const SUB_TASK_RESPONSES = gql`
  subscription SubTaskResponses($task_id: Int!) {
    response_stream(
      batch_size: 50
      cursor: { initial_value: { timestamp: "1970-01-01" } }
      where: { task_id: { _eq: $task_id } }
    ) {
      id
      response: response_text
      timestamp
    }
  }
`

// Mutations
// callback_id must be the callback's display_id (not the internal id).
// tasking_location "command_line" tells Mythic to treat params as raw CLI input.
export const CREATE_TASK = gql`
  mutation CreateTask(
    $callback_id: Int!
    $command: String!
    $params: String!
    $tasking_location: String
    $original_params: String
  ) {
    createTask(
      callback_id: $callback_id
      command: $command
      params: $params
      tasking_location: $tasking_location
      original_params: $original_params
    ) {
      status
      error
      id
    }
  }
`
