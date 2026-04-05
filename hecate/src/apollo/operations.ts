/* ═══════════════════════════════════════════════════
   hecate/src/apollo/operations.ts

   All GraphQL operations for Mythic's API.
   Mythic v3 uses GraphQL (Hasura-style) — field names
   follow the official schema at docs.mythic-c2.net
   ═══════════════════════════════════════════════════ */

import { gql } from '@apollo/client'

// ─────────────────────────────────────────────────────
// FRAGMENTS
// ─────────────────────────────────────────────────────

export const CALLBACK_FIELDS = gql`
  fragment CallbackFields on callback {
    id
    display_id
    agent_callback_id
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
    payload {
      payloadtype { name }
      description
    }
    callbackc2profiles { c2profile { name } }
    operation { name }
  }
`

export const TASK_FIELDS = gql`
  fragment TaskFields on task {
    id
    display_id
    command_name
    params
    status
    timestamp
    completed
    operator { username }
    callback {
      id
      display_id
      host
    }
    responses(order_by: { id: asc }) {
      id
      response
      timestamp
    }
  }
`

// ─────────────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────────────

export const GET_CALLBACKS = gql`
  ${CALLBACK_FIELDS}
  query GetCallbacks($operation_id: Int!) {
    callback(
      where: { operation_id: { _eq: $operation_id }, active: { _eq: true } }
      order_by: { last_checkin: desc }
    ) {
      ...CallbackFields
    }
  }
`

export const GET_TASKS = gql`
  ${TASK_FIELDS}
  query GetTasks($callback_id: Int!, $limit: Int = 50) {
    task(
      where: { callback_id: { _eq: $callback_id } }
      order_by: { id: desc }
      limit: $limit
    ) {
      ...TaskFields
    }
  }
`

export const GET_OPERATIONS = gql`
  query GetOperations {
    operation(order_by: { name: asc }) {
      id
      name
      admin { username }
      complete
    }
  }
`

export const GET_PROCESSES = gql`
  query GetProcesses($callback_id: Int!) {
    callbackport(where: { callback_id: { _eq: $callback_id } }) {
      local_port
      remote_ip
      remote_port
      proto
    }
    process(
      where: { host: { _eq: "" } }   # replace with callback host
      order_by: { process_id: asc }
    ) {
      process_id
      parent_process_id
      name
      user
      bin_path
      architecture
    }
  }
`

// ─────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────

export const CREATE_TASK = gql`
  mutation CreateTask($callback_id: Int!, $command: String!, $params: String!) {
    createTask(callback_id: $callback_id, command: $command, params: $params) {
      status
      error
      id
    }
  }
`

export const UPDATE_CALLBACK_SLEEP = gql`
  mutation UpdateSleep($callback_id: Int!, $sleep_info: String!) {
    updateCallback(callback_id: $callback_id, sleep_info: $sleep_info) {
      status
      error
    }
  }
`

// ─────────────────────────────────────────────────────
// SUBSCRIPTIONS
// ─────────────────────────────────────────────────────

// Live callback list — reconnects automatically via wsLink
export const SUB_CALLBACKS = gql`
  ${CALLBACK_FIELDS}
  subscription SubCallbacks($operation_id: Int!) {
    callback(
      where: { operation_id: { _eq: $operation_id }, active: { _eq: true } }
      order_by: { last_checkin: desc }
    ) {
      ...CallbackFields
    }
  }
`

// Live task feed for a single callback
export const SUB_TASKS = gql`
  ${TASK_FIELDS}
  subscription SubTasks($callback_id: Int!, $limit: Int = 50) {
    task(
      where: { callback_id: { _eq: $callback_id } }
      order_by: { id: desc }
      limit: $limit
    ) {
      ...TaskFields
    }
  }
`

// Streaming task responses (output chunks)
export const SUB_TASK_RESPONSES = gql`
  subscription SubTaskResponses($task_id: Int!) {
    response(
      where: { task_id: { _eq: $task_id } }
      order_by: { id: asc }
    ) {
      id
      response
      timestamp
    }
  }
`

// New callbacks (for toast notifications)
export const SUB_NEW_CALLBACKS = gql`
  subscription SubNewCallbacks($operation_id: Int!, $since: timestamp!) {
    callback(
      where: {
        operation_id: { _eq: $operation_id }
        init_callback: { _gte: $since }
      }
      order_by: { init_callback: desc }
    ) {
      id
      display_id
      host
      user
      payload { payloadtype { name } }
    }
  }
`
