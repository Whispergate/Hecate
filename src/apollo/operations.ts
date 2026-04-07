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

// Payload list for the active operation
export const GET_PAYLOADS = gql`
  query GetPayloads($operation_id: Int!) {
    payload(
      where:    { operation_id: { _eq: $operation_id }, deleted: { _eq: false } }
      order_by: { id: desc }
    ) {
      id
      uuid
      description
      os
      build_phase
      creation_time
      auto_generated
      operator    { username }
      payloadtype { name }
      filemetum   { agent_file_id filename_text }
      callbacks_aggregate { aggregate { count } }
      payload_build_steps(order_by: { step_number: asc }) {
        id
        step_number
        step_name
        step_success
        start_time
        end_time
        step_stdout
        step_stderr
        step_description
      }
    }
  }
`

// All payload types (agents) available for building
export const GET_PAYLOAD_TYPES = gql`
  query GetPayloadTypes {
    payloadtype(
      where:    { deleted: { _eq: false } }
      order_by: { name: asc }
    ) {
      id
      name
      file_extension
      supported_os
      note
      container_running
      wrapper
      c2_parameter_deviations
      wrap_these_payload_types { wrapped { id name } }
      buildparameters(where: { deleted: { _eq: false } }, order_by: { id: asc }) {
        id
        name
        description
        parameter_type
        default_value
        required
        randomize
        format_string
        choices
        crypto_type
        hide_conditions
        ui_position
      }
      payloadtypec2profiles {
        c2profile {
          id
          name
          is_p2p
          description
          c2profileparameters(where: { deleted: { _eq: false } }, order_by: { id: asc }) {
            id
            name
            description
            parameter_type
            default_value
            required
            randomize
            format_string
            choices
            crypto_type
            ui_position
          }
        }
      }
    }
  }
`

// Payloads that can be wrapped by a given wrapper type
export const GET_WRAPPABLE_PAYLOADS = gql`
  query GetWrappablePayloads($wrapper_type_id: Int!) {
    payloadtype_by_pk(id: $wrapper_type_id) {
      wrap_these_payload_types {
        wrapped {
          name
          payloads(
            where: { auto_generated: { _eq: false }, build_phase: { _eq: "success" }, deleted: { _eq: false } }
            order_by: { id: desc }
          ) {
            id
            uuid
            description
            creation_time
            filemetum { filename_text }
          }
        }
      }
    }
  }
`

// Soft-delete a payload via Hasura action (update_payload_by_pk is not exposed)
export const DELETE_PAYLOAD = gql`
  mutation DeletePayload($payload_uuid: String!) {
    updatePayload(payload_uuid: $payload_uuid, deleted: true) {
      status
      error
      id
    }
  }
`

// Commands available for a payload type
export const GET_COMMANDS_FOR_TYPE = gql`
  query GetCommandsForType($payload_type_id: Int!) {
    command(
      where:    { payload_type_id: { _eq: $payload_type_id }, deleted: { _eq: false } }
      order_by: { cmd: asc }
    ) {
      id
      cmd
      description
    }
  }
`

// Create a new payload (Hasura action → Mythic Go server)
export const CREATE_PAYLOAD = gql`
  mutation CreatePayload($payloadDefinition: String!) {
    createPayload(payloadDefinition: $payloadDefinition) {
      status
      error
      uuid
    }
  }
`

// Watch a payload build by UUID
export const SUB_PAYLOAD_BUILD = gql`
  subscription SubPayloadBuild($uuid: String!) {
    payload(where: { uuid: { _eq: $uuid } }) {
      build_phase
      build_message
      build_stderr
      filemetum { agent_file_id }
      payload_build_steps(order_by: { step_number: asc }) {
        id
        step_number
        step_name
        step_description
        step_success
        start_time
        end_time
        step_stdout
        step_stderr
      }
    }
  }
`

// ── Services panel subscriptions ──────────────────────

export const SUB_PAYLOAD_TYPES = gql`
  subscription SubPayloadTypes {
    payloadtype(order_by: { name: asc }, where: { deleted: { _eq: false } }) {
      id
      name
      author
      note
      container_running
      wrapper
      agent_type
      semver
      supported_os
      translationcontainer { id name container_running }
      wrap_these_payload_types { wrapped { name } }
    }
  }
`

export const SUB_C2_PROFILES = gql`
  subscription SubC2Profiles {
    c2profile(order_by: { name: asc }, where: { deleted: { _eq: false } }) {
      id
      name
      author
      description
      is_p2p
      running
      container_running
      semver
      payloadtypec2profiles(order_by: { payloadtype: { name: asc } }) {
        payloadtype { id name deleted }
      }
    }
  }
`

export const SUB_TRANSLATION_CONTAINERS = gql`
  subscription SubTranslationContainers {
    translationcontainer(order_by: { name: asc }, where: { deleted: { _eq: false } }) {
      id
      name
      author
      description
      container_running
      semver
      payloadtypes(order_by: { name: asc }) { id name deleted }
    }
  }
`

export const SUB_CONSUMING_SERVICES = gql`
  subscription SubConsumingServices {
    consuming_container(order_by: { name: asc }, where: { deleted: { _eq: false } }) {
      id
      name
      description
      type
      container_running
      semver
    }
  }
`

// ── Container/service actions ──────────────────────────

export const START_STOP_C2 = gql`
  mutation StartStopC2($id: Int!, $action: String) {
    startStopProfile(id: $id, action: $action) {
      status
      error
      output
    }
  }
`

export const CONTAINER_LIST_FILES = gql`
  query ContainerListFiles($container_name: String!) {
    containerListFiles(container_name: $container_name) {
      status
      error
      files
    }
  }
`

export const CONTAINER_DOWNLOAD_FILE = gql`
  query ContainerDownloadFile($container_name: String!, $filename: String!) {
    containerDownloadFile(container_name: $container_name, filename: $filename) {
      status
      error
      filename
      data
    }
  }
`

export const CONTAINER_WRITE_FILE = gql`
  mutation ContainerWriteFile($container_name: String!, $file_path: String!, $data: String!) {
    containerWriteFile(container_name: $container_name, file_path: $file_path, data: $data) {
      status
      error
      filename
    }
  }
`

export const GET_AGENT_COMMANDS = gql`
  query GetAgentCommands($payload_name: String!) {
    command(
      where: { payloadtype: { name: { _eq: $payload_name } }, deleted: { _eq: false } }
      order_by: { cmd: asc }
    ) {
      id
      cmd
      description
      help_cmd
      version
    }
  }
`

// All tasks in operation for report generation (RLS scopes to user's operations)
export const GET_REPORT_TASKS = gql`
  query GetReportTasks($limit: Int = 1000) {
    task(order_by: { timestamp: asc }, limit: $limit) {
      id
      display_id
      command_name
      display_params
      params
      status
      completed
      timestamp
      operator { username }
      callback { id display_id host ip user os }
      response_count
      tags { tagtype { name color } }
    }
  }
`

// Commands for a payload type — used for tab completion
export const GET_COMMANDS = gql`
  query GetCommands($payloadtype_name: String!) {
    command(
      where: { payloadtype: { name: { _eq: $payloadtype_name } } }
      order_by: { cmd: asc }
    ) {
      cmd
      description
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
