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
    agent_task_id
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
    extra_info
    cwd
    impersonation_context
    active
    locked
    last_checkin
    init_callback
    payload {
      payloadtype { name }
      description
      c2profileparametersinstances {
        value
        c2profileparameter { name }
      }
    }
    callbackc2profiles { c2profile { name } }
    operation { name }
    tasks(
      where: { command_name: { _eq: "sleep" }, completed: { _eq: true } }
      order_by: { timestamp: desc }
      limit: 1
    ) { params timestamp }
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
// Order by id (stable insertion order) so frequent check-ins don't reorder the list
export const SUB_CALLBACKS = gql`
  ${CALLBACK_FIELDS}
  subscription SubCallbacks($operation_id: Int!) {
    callback(
      where: { operation_id: { _eq: $operation_id }, active: { _eq: true } }
      order_by: { id: asc }
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
      filemetum   { id agent_file_id filename_text md5 sha1 }
      callbacks_aggregate { aggregate { count } }
      c2profileparametersinstances {
        value
        c2profileparameter { name c2profile { name is_p2p } }
      }
      buildparameterinstances {
        value
        buildparameter { name }
      }
      payloadcommands { command { cmd } }
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

// One-time fetch of all response chunks for a task (for file browser)
export const GET_TASK_RESPONSE = gql`
  query GetTaskResponse($task_id: Int!) {
    response(
      where:    { task_id: { _eq: $task_id } }
      order_by: { id: asc }
    ) {
      response: response_text
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

export const UPDATE_PAYLOAD_DESCRIPTION = gql`
  mutation UpdatePayloadDescription($payload_uuid: String!, $description: String!) {
    updatePayload(payload_uuid: $payload_uuid, description: $description) {
      status
      error
      description
    }
  }
`

// filename is bytea — pass plain string, Hasura stores raw UTF-8 bytes via PG text→bytea cast
export const RENAME_PAYLOAD_FILE = gql`
  mutation RenamePayloadFile($file_id: Int!, $filename: bytea!) {
    update_filemeta_by_pk(pk_columns: { id: $file_id }, _set: { filename: $filename }) {
      id
      filename_text
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

// Recent tasks across the whole operation — used by OverviewPanel activity feed
export const SUB_RECENT_OP_TASKS = gql`
  ${TASK_FIELDS}
  subscription SubRecentOpTasks($operation_id: Int!, $limit: Int = 40) {
    task(
      where: { callback: { operation_id: { _eq: $operation_id } } }
      order_by: { id: desc }
      limit: $limit
    ) { ...TaskFields }
  }
`

// All tasks in operation for report generation
export const GET_REPORT_TASKS = gql`
  query GetReportTasks($operation_id: Int!, $limit: Int = 1000) {
    task(
      where: { callback: { operation_id: { _eq: $operation_id } } }
      order_by: { timestamp: asc }
      limit: $limit
    ) {
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

// Commands for a payload type — used for tab completion and param detection
export const GET_COMMANDS = gql`
  query GetCommands($payloadtype_name: String!) {
    command(
      where: { payloadtype: { name: { _eq: $payloadtype_name } } }
      order_by: { cmd: asc }
    ) {
      cmd
      description
      script_only
      commandparameters(order_by: { ui_position: asc }) {
        name
        display_name
        type
        required
        default_value
        choices
        parameter_group_name
        limit_credentials_by_type
      }
    }
  }
`

// Switch the operator's current operation server-side.
// Mythic updates operator.current_operation_id in the DB and calls UpdateHasuraClaims,
// so all subsequent Hasura queries see the new operation's RLS scope.
export const UPDATE_CURRENT_OPERATION = gql`
  mutation UpdateCurrentOperation($user_id: Int!, $operation_id: Int!) {
    updateCurrentOperation(user_id: $user_id, operation_id: $operation_id) {
      status
      error
      operation_id
      name
      complete
    }
  }
`

// All filemeta for the active operation (excludes payloads, excludes deleted).
// filename_text and full_remote_path_text are base64-encoded bytea — decode with atob().
export const GET_FILES = gql`
  query GetFiles($operation_id: Int!) {
    filemeta(
      where: {
        operation_id: { _eq: $operation_id }
        deleted: { _eq: false }
        is_payload: { _eq: false }
      }
      order_by: { timestamp: desc }
    ) {
      id
      agent_file_id
      filename_text
      full_remote_path_text
      host
      size
      complete
      total_chunks
      chunks_received
      is_download_from_agent
      is_screenshot
      md5
      sha1
      comment
      timestamp
      operator { username }
      task { display_id }
    }
  }
`

// ─────────────────────────────────────────────────────
// ACCOUNT / SETTINGS
// ─────────────────────────────────────────────────────

// Current operator's API tokens (User type, non-deleted)
export const GET_API_TOKENS = gql`
  query GetAPITokens {
    apitokens(
      where: { deleted: { _eq: false }, token_type: { _eq: "User" } }
      order_by: { id: desc }
    ) {
      id
      name
      active
      token_type
    }
  }
`

export const CREATE_API_TOKEN = gql`
  mutation CreateAPIToken($token_type: String!, $name: String) {
    createAPIToken(token_type: $token_type, name: $name) {
      id
      name
      token_value
      active
      token_type
      status
      error
    }
  }
`

export const DELETE_API_TOKEN = gql`
  mutation DeleteAPIToken($apitokens_id: Int!) {
    deleteAPIToken(apitokens_id: $apitokens_id) {
      status
      error
    }
  }
`

// Change password for the current operator
export const CHANGE_PASSWORD = gql`
  mutation ChangePassword($old_password: String!, $new_password: String!) {
    updatePasswordAndEmail(old_password: $old_password, new_password: $new_password) {
      status
      error
    }
  }
`

// ─────────────────────────────────────────────────────
// OPERATOR MANAGEMENT (admin)
// ─────────────────────────────────────────────────────

export const GET_OPERATORS = gql`
  query GetOperators {
    operator(order_by: { username: asc }) {
      id
      username
      email
      active
      admin
      deleted
      last_login
      creation_time
      account_type
      operation { id name }
    }
  }
`

export const CREATE_OPERATOR = gql`
  mutation CreateOperator($username: String!, $password: String!, $email: String, $bot: Boolean) {
    createOperator(input: { username: $username, password: $password, email: $email, bot: $bot }) {
      status
      error
      id
      username
      active
      admin
      deleted
      account_type
      email
    }
  }
`

// Update operator active / admin / deleted flags via Mythic action
export const UPDATE_OPERATOR_STATUS = gql`
  mutation UpdateOperatorStatus($operator_id: Int!, $active: Boolean, $admin: Boolean, $deleted: Boolean) {
    updateOperatorStatus(operator_id: $operator_id, active: $active, admin: $admin, deleted: $deleted) {
      status
      error
      id
      active
      admin
      deleted
    }
  }
`

// Admin updating another user's username (direct table mutation, admin permission required)
export const UPDATE_OPERATOR_USERNAME = gql`
  mutation UpdateOperatorUsername($id: Int!, $username: String!) {
    update_operator_by_pk(pk_columns: { id: $id }, _set: { username: $username }) {
      id
      username
    }
  }
`

// Admin updating another user's password/email (user_id bypasses old_password requirement)
export const UPDATE_OPERATOR_CREDENTIALS = gql`
  mutation UpdateOperatorCredentials($user_id: Int!, $new_password: String, $email: String) {
    updatePasswordAndEmail(user_id: $user_id, new_password: $new_password, email: $email) {
      status
      error
      operator_id
    }
  }
`

// ─────────────────────────────────────────────────────
// OPERATION MANAGEMENT
// ─────────────────────────────────────────────────────

// All operations the user belongs to, with members.
// Also fetches all active operators for the assignment UI.
export const GET_OPERATIONS_WITH_MEMBERS = gql`
  query GetOperationsWithMembers {
    operation(order_by: { name: asc }) {
      id
      name
      complete
      deleted
      banner_text
      banner_color
      admin { id username account_type }
      operatoroperations {
        id
        view_mode
        operator { id username account_type }
      }
    }
    operator(where: { active: { _eq: true }, deleted: { _eq: false } }, order_by: { username: asc }) {
      id
      username
      account_type
    }
  }
`

export const CREATE_OPERATION = gql`
  mutation CreateOperation($name: String!) {
    createOperation(name: $name) {
      status
      error
      operation_id
      operation_name
    }
  }
`

// Update op name, complete, channel/webhook, banner, admin_id, or deleted flag.
// All fields except operation_id are optional (Mythic action handles partial updates).
export const UPDATE_OPERATION = gql`
  mutation UpdateOperation(
    $operation_id: Int!
    $name: String
    $complete: Boolean
    $admin_id: Int
    $deleted: Boolean
    $channel: String
    $webhook: String
    $banner_text: String
    $banner_color: String
  ) {
    updateOperation(
      operation_id: $operation_id
      name: $name
      complete: $complete
      admin_id: $admin_id
      deleted: $deleted
      channel: $channel
      webhook: $webhook
      banner_text: $banner_text
      banner_color: $banner_color
    ) {
      status
      error
      id
      name
      complete
    }
  }
`

// Add/remove members or update view_mode (operator / spectator).
// Lead changes use UPDATE_OPERATION(admin_id) instead.
export const UPDATE_OPERATOR_OPERATION = gql`
  mutation UpdateOperatorOperation(
    $operation_id: Int!
    $add_users: [Int]
    $remove_users: [Int]
    $view_mode_operators: [Int]
    $view_mode_spectators: [Int]
  ) {
    updateOperatorOperation(
      operation_id: $operation_id
      add_users: $add_users
      remove_users: $remove_users
      view_mode_operators: $view_mode_operators
      view_mode_spectators: $view_mode_spectators
    ) {
      status
      error
    }
  }
`

// ─────────────────────────────────────────────────────
// MYTHICTREE — file browser
// ─────────────────────────────────────────────────────

// Initial load: all file-type tree nodes for a callback (non-deleted).
export const GET_MYTHIC_TREE = gql`
  query GetMythicTree($callback_id: Int!) {
    mythictree(
      where: {
        callback_id: { _eq: $callback_id }
        tree_type:   { _eq: "file" }
        deleted:     { _eq: false }
      }
      order_by: { id: asc }
    ) {
      id
      full_path_text
      parent_path_text
      name_text
      can_have_children
      has_children
      success
      host
      metadata
      filemeta { agent_file_id }
    }
  }
`

// Streaming subscription: new/updated nodes after mount (cursor = now).
// Does NOT filter deleted so we catch soft-delete events from update_deleted.
export const SUB_MYTHIC_TREE = gql`
  subscription SubMythicTree($callback_id: Int!, $now: timestamp!) {
    mythictree_stream(
      batch_size: 200
      cursor: { initial_value: { timestamp: $now } }
      where: {
        callback_id: { _eq: $callback_id }
        tree_type:   { _eq: "file" }
      }
    ) {
      id
      full_path_text
      parent_path_text
      name_text
      can_have_children
      has_children
      success
      deleted
      host
      metadata
      filemeta { agent_file_id }
    }
  }
`

// ─────────────────────────────────────────────────────
// MITRE ATT&CK
// ─────────────────────────────────────────────────────

// All techniques — no RLS, global table.
// os and tactic are stored as JSON strings; parse client-side.
export const GET_ATTACK = gql`
  query GetAttack {
    attack(order_by: { t_num: asc }) {
      id
      t_num
      name
      os
      tactic
    }
  }
`

// Commands mapped to techniques — no RLS, global.
export const GET_ATTACK_COMMANDS = gql`
  query GetAttackCommands {
    attackcommand {
      attack_id
      command {
        cmd
        payloadtype { name }
      }
    }
  }
`

// Tasks mapped to techniques — RLS auto-filters to current operation.
export const GET_ATTACK_TASKS = gql`
  query GetAttackTasks {
    attacktask {
      attack_id
      task {
        id
        display_id
        command_name
        display_params
        callback { display_id host }
      }
    }
  }
`

// cmd → technique mapping for ReportPanel — inherits ATT&CK coverage from attackcommand.
// No RLS (global table). Used to derive per-task TTPs from command type.
export const GET_REPORT_ATTACK_COMMANDS = gql`
  query GetReportAttackCommands {
    attackcommand {
      command { cmd }
      attack  { t_num }
    }
  }
`

// Lean join for ReportPanel TTP section — task_id + technique metadata only.
// RLS auto-filters to current operation via task → callback → operation_id.
export const GET_REPORT_ATTACK_TASKS = gql`
  query GetReportAttackTasks {
    attacktask {
      task_id
      attack {
        t_num
        name
      }
    }
  }
`

// All tasks for the operation — used by TimelinePanel swimlane view.
// Lean shape: no tags, no response_count. Limit 2000.
export const GET_TIMELINE_TASKS = gql`
  query GetTimelineTasks($operation_id: Int!, $limit: Int = 2000) {
    task(
      where:    { callback: { operation_id: { _eq: $operation_id } } }
      order_by: { timestamp: asc }
      limit:    $limit
    ) {
      id
      display_id
      command_name
      display_params
      status
      completed
      timestamp
      operator { username }
      callback  { id display_id host }
    }
  }
`

// Historical commands for a callback — seeds CommandBar history on first visit.
// Uses display_params (always human-readable) rather than raw params.
export const GET_CALLBACK_TASK_HISTORY = gql`
  query GetCallbackTaskHistory($callback_id: Int!, $limit: Int = 50) {
    task(
      where:    { callback_id: { _eq: $callback_id } }
      order_by: { id: desc }
      limit:    $limit
    ) {
      command_name
      display_params
    }
  }
`

// ─────────────────────────────────────────────────────
// TASK MUTATIONS
// ─────────────────────────────────────────────────────

// Mutations
// callback_id must be the callback's display_id (not the internal id).
// tasking_location "command_line" tells Mythic to treat params as raw CLI input.
// tasking_location "modal" tells Mythic params is a JSON object; pass file UUIDs in files[].
export const CREATE_TASK = gql`
  mutation CreateTask(
    $callback_id: Int!
    $command: String!
    $params: String!
    $tasking_location: String
    $original_params: String
    $files: [String]
    $parameter_group_name: String
  ) {
    createTask(
      callback_id: $callback_id
      command: $command
      params: $params
      tasking_location: $tasking_location
      original_params: $original_params
      files: $files
      parameter_group_name: $parameter_group_name
    ) {
      status
      error
      id
    }
  }
`

// ─────────────────────────────────────────────────────
// CALLBACK PORTS (SOCKS / RPFWD)
// ─────────────────────────────────────────────────────

export const SUB_CALLBACK_PORTS = gql`
  subscription SubCallbackPorts($operation_id: Int!) {
    callbackport(
      where: {
        operation_id: { _eq: $operation_id }
        deleted: { _eq: false }
      }
      order_by: { id: asc }
    ) {
      id
      callback_id
      local_port
      remote_port
      remote_ip
      port_type
      bytes_sent
      bytes_received
      updated_at
      callback {
        host
        display_id
        payload { payloadtype { name } }
      }
      task { display_id }
    }
  }
`

// ─────────────────────────────────────────────────────
// CALLBACK GRAPH EDGES (P2P parent / child topology)
// ─────────────────────────────────────────────────────

// Live edges in the current operation. Active edges have end_timestamp = null.
// Self-loops (source == destination) represent a callback's own egress and are
// filtered client-side.
export const SUB_CALLBACK_GRAPH_EDGES = gql`
  subscription SubCallbackGraphEdges($operation_id: Int!) {
    callbackgraphedge(
      where: {
        operation_id:  { _eq: $operation_id }
        end_timestamp: { _is_null: true }
      }
      order_by: { id: asc }
    ) {
      id
      source_id
      destination_id
      c2profile { id name is_p2p }
    }
  }
`

// ─────────────────────────────────────────────────────
// CALLBACK MUTATIONS
// ─────────────────────────────────────────────────────

export const UPDATE_CALLBACK_DESCRIPTION = gql`
  mutation UpdateCallbackDescription($callback_display_id: Int!, $description: String!) {
    updateCallback(input: { callback_display_id: $callback_display_id, description: $description }) {
      status
      error
    }
  }
`

export const LOCK_CALLBACK = gql`
  mutation LockCallback($callback_display_id: Int!) {
    updateCallback(input: { callback_display_id: $callback_display_id, locked: true }) {
      status
      error
    }
  }
`

export const UNLOCK_CALLBACK = gql`
  mutation UnlockCallback($callback_display_id: Int!) {
    updateCallback(input: { callback_display_id: $callback_display_id, locked: false }) {
      status
      error
    }
  }
`

export const HIDE_CALLBACK = gql`
  mutation HideCallback($callback_display_id: Int!) {
    updateCallback(input: { callback_display_id: $callback_display_id, active: false }) {
      status
      error
    }
  }
`

export const GET_JOB_KILL_COMMAND = gql`
  query GetJobKillCommand($callback_id: Int!) {
    loadedcommands(where: {
      callback_id: { _eq: $callback_id }
      command: { supported_ui_features: { _contains: "task:job_kill" } }
    }) {
      command { cmd }
    }
  }
`


// ── Credentials ───────────────────────────────────────

const CREDENTIAL_FIELDS = gql`
  fragment CredentialFields on credential {
    id type account realm credential_text comment metadata timestamp deleted
    operator { username }
    task { display_id callback { host display_id } }
  }
`

export const GET_CREDENTIALS = gql`
  ${CREDENTIAL_FIELDS}
  query GetCredentials {
    credential(
      where: { deleted: { _eq: false } }
      order_by: { timestamp: desc }
    ) { ...CredentialFields }
  }
`

export const SUB_CREDENTIALS = gql`
  ${CREDENTIAL_FIELDS}
  subscription SubCredentials($now: timestamp!) {
    credential_stream(
      batch_size: 50
      cursor: { initial_value: { timestamp: $now } }
    ) { ...CredentialFields }
  }
`

export const CREATE_CREDENTIAL = gql`
  mutation CreateCredential(
    $credential_type: String, $account: String, $realm: String,
    $credential: String, $comment: String
  ) {
    createCredential(
      credential_type: $credential_type, account: $account, realm: $realm,
      credential: $credential, comment: $comment
    ) {
      status
      error
    }
  }
`

export const UPDATE_CREDENTIAL = gql`
  ${CREDENTIAL_FIELDS}
  mutation UpdateCredential(
    $id: Int!, $type: String!, $account: String!, $realm: String!,
    $credential: bytea!, $comment: String!, $metadata: String!
  ) {
    update_credential_by_pk(
      pk_columns: { id: $id }
      _set: {
        type: $type, account: $account, realm: $realm,
        credential_raw: $credential, comment: $comment, metadata: $metadata
      }
    ) { ...CredentialFields }
  }
`

export const DELETE_CREDENTIAL = gql`
  mutation DeleteCredential($id: Int!) {
    update_credential_by_pk(
      pk_columns: { id: $id }
      _set: { deleted: true }
    ) { id deleted }
  }
`

// ── Event Log ─────────────────────────────────────────

const EVENT_FIELDS = gql`
  fragment EventFields on operationeventlog {
    id level message source resolved warning count timestamp
    operator { username }
  }
`

export const GET_EVENT_LOG = gql`
  ${EVENT_FIELDS}
  query GetEventLog($limit: Int!) {
    operationeventlog(
      where: { deleted: { _eq: false } }
      order_by: { id: desc }
      limit: $limit
    ) { ...EventFields }
  }
`

export const SUB_EVENT_LOG = gql`
  ${EVENT_FIELDS}
  subscription SubEventLog($now: timestamp!) {
    operationeventlog_stream(
      batch_size: 50
      cursor: { initial_value: { timestamp: $now } }
      where: { deleted: { _eq: false } }
    ) { ...EventFields }
  }
`

export const INSERT_EVENT = gql`
  ${EVENT_FIELDS}
  mutation InsertEvent($message: String!) {
    insert_operationeventlog_one(object: { message: $message, level: "info" }) {
      ...EventFields
    }
  }
`

export const UPDATE_EVENT_RESOLVED = gql`
  mutation UpdateEventResolved($id: Int!, $resolved: Boolean!) {
    update_operationeventlog_by_pk(
      pk_columns: { id: $id }
      _set: { resolved: $resolved }
    ) { id resolved }
  }
`

export const RESOLVE_ALL_WARNINGS = gql`
  mutation ResolveAllWarnings {
    update_operationeventlog(
      where: { resolved: { _eq: false }, warning: { _eq: true }, deleted: { _eq: false } }
      _set: { resolved: true }
    ) { returning { id resolved } }
  }
`

export const GET_INJECT_PAYLOADS = gql`
  query GetInjectPayloads {
    payload(
      where: { deleted: { _eq: false }, build_phase: { _eq: "success" } }
      order_by: { id: desc }
    ) {
      uuid
      description
      payloadtype { name }
      filemetum { filename_text }
      buildparameterinstances {
        value
        buildparameter { name }
      }
    }
  }
`

export const SUB_OPERATION_ALERT_COUNT = gql`
  subscription SubOperationAlertCount {
    operation_stream(
      cursor: { initial_value: { updated_at: "1970-01-01" }, ordering: ASC }
      batch_size: 1
    ) {
      id
      alert_count
    }
  }
`

// ── link / unlink modals ──────────────────────────────

export const GET_CALLBACK_GRAPH_EDGES = gql`
  query GetCallbackGraphEdges($callback_id: Int!) {
    callbackgraphedge(
      where: {
        _or: [
          { source_id:      { _eq: $callback_id } }
          { destination_id: { _eq: $callback_id } }
        ]
      }
    ) {
      id
      end_timestamp
      c2profile { id name }
      source {
        id display_id host agent_callback_id
        payload { uuid }
        c2profileparametersinstances {
          c2_profile_id value enc_key_base64 dec_key_base64
          c2profileparameter { crypto_type name }
        }
      }
      destination {
        id display_id host agent_callback_id
        payload { uuid }
        c2profileparametersinstances {
          c2_profile_id value enc_key_base64 dec_key_base64
          c2profileparameter { crypto_type name }
        }
      }
    }
  }
`

export const GET_P2P_PAYLOADS = gql`
  query GetP2PPayloads {
    payload(
      where: {
        deleted:       { _eq: false }
        build_phase:   { _eq: "success" }
        payloadc2profiles: { c2profile: { is_p2p: { _eq: true } } }
      }
      order_by: { id: desc }
    ) {
      id
      description
      payloadtype { name }
      filemetum   { filename_text }
    }
  }
`

export const ADD_PAYLOAD_ON_HOST = gql`
  mutation AddPayloadOnHost($host: String!, $payload_id: Int!) {
    insert_payloadonhost_one(object: { host: $host, payload_id: $payload_id }) {
      id
    }
  }
`

export const GET_LINK_TARGETS = gql`
  query GetLinkTargets($operation_id: Int!) {
    payloadonhost(
      where: {
        deleted:      { _eq: false }
        operation_id: { _eq: $operation_id }
        payload: { c2profileparametersinstances: { c2profile: { is_p2p: { _eq: true } } } }
      }
      order_by: { id: desc }
    ) {
      host
      payload {
        uuid description
        filemetum { filename_text }
        c2profileparametersinstances(
          where: { c2profile: { is_p2p: { _eq: true } } }
        ) {
          c2_profile_id value enc_key_base64 dec_key_base64
          c2profile { id name }
          c2profileparameter { crypto_type name }
        }
      }
    }
    callback(
      where: {
        active:        { _eq: true }
        operation_id:  { _eq: $operation_id }
        c2profileparametersinstances: { c2profile: { is_p2p: { _eq: true } } }
      }
    ) {
      agent_callback_id host display_id
      payload { uuid }
      c2profileparametersinstances(
        where: { c2profile: { is_p2p: { _eq: true } } }
      ) {
        c2_profile_id value enc_key_base64 dec_key_base64
        c2profile { id name }
        c2profileparameter { crypto_type name }
      }
    }
  }
`
