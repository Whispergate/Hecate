/* src/components/TaskFeed/browserTableConfigs.ts
   Per-command table configs — one entry per Apollo browser script that renders
   an action-bearing table. Keyed by Mythic command_name. Mirrors the JSON row
   shapes and ui_feature → command mappings in Apollo's browser_scripts/*.js.

   ui_feature → command resolution (from supported_ui_features in agent_functions):
     jobkill                       → jobkill
     sc:start|stop|delete|modify   → sc
     net_shares                    → net_shares
     net_localgroup_member         → net_localgroup_member
     file_browser:list             → ls
     apollo:remove_registered_file → remove_registered_file
     reg_query                     → reg_query
     apollo:ticket_cache_*         → ticket_cache_extract|purge|add
     apollo:ticket_store_*         → ticket_store_purge|add
*/

import type { BrowserTableConfig } from './BrowserTable'

export const BROWSER_TABLE_CONFIGS: Record<string, BrowserTableConfig> = {

  // ── jobs → jobkill ──────────────────────────────────
  jobs: {
    title: 'Running Jobs',
    columns: [
      { key: 'operator',  label: 'operator' },
      { key: 'command',   label: 'command' },
      { key: 'arguments', label: 'arguments', get: r => r.display_params, grow: true },
    ],
    actions: r => [
      { label: 'kill', command: 'jobkill', params: () => String(r.agent_task_id), danger: true },
    ],
  },

  // ── sc → service control ────────────────────────────
  sc: {
    title: 'Services',
    columns: [
      { key: 'status',  label: 'status' },
      { key: 'pid',     label: 'pid', get: r => (r.pid === '0' ? '' : r.pid) },
      { key: 'service', label: 'service' },
      { key: 'display', label: 'display name', get: r => r.display_name, grow: true },
      { key: 'binary',  label: 'binary path', get: r => r.binary_path, grow: true },
    ],
    actions: r => {
      const isStart = r.status === 'Stopped'
      const isStop  = r.can_stop && (r.status === 'Running' || r.status === 'StartPending')
      const base    = { computer: r.computer, service: r.service }
      return [
        { label: 'start',  command: 'sc', params: () => JSON.stringify({ start: true, ...base }),  disabled: () => !isStart },
        { label: 'stop',   command: 'sc', params: () => JSON.stringify({ stop: true, ...base }),   disabled: () => !isStop },
        { label: 'delete', command: 'sc', params: () => JSON.stringify({ delete: true, ...base }), confirm: `Delete service "${r.service}" on ${r.computer}?`, danger: true },
        { label: 'modify', command: 'sc', params: () => JSON.stringify({ modify: true, ...base, dependencies: [] }) },
      ]
    },
  },

  // ── net_dclist → net_shares ─────────────────────────
  net_dclist: {
    title: 'Domain Controllers',
    columns: [
      { key: 'name',   label: 'name', get: r => r.computer_name + (r.global_catalog ? ' (GC)' : ''), copy: true },
      { key: 'domain', label: 'domain' },
      { key: 'forest', label: 'forest' },
      { key: 'ip',     label: 'ip', get: r => r.ip_address, copy: true },
      { key: 'os',     label: 'os', get: r => r.os_version, grow: true },
    ],
    actions: r => [
      { label: 'shares', command: 'net_shares', params: () => r.computer_name },
    ],
  },

  // ── net_localgroup → net_localgroup_member ──────────
  net_localgroup: {
    title: 'Local Groups',
    columns: [
      { key: 'name',    label: 'name', get: r => r.group_name },
      { key: 'comment', label: 'comment', grow: true },
      { key: 'sid',     label: 'sid', copy: true },
    ],
    actions: r => [
      { label: 'members', command: 'net_localgroup_member', params: () => JSON.stringify({ Computer: r.computer_name, Group: r.group_name }) },
    ],
  },

  // ── net_shares → ls (file_browser:list) ─────────────
  net_shares: {
    title: rows => (rows[0]?.computer_name ? `Shares for ${rows[0].computer_name}` : 'Shares'),
    columns: [
      { key: 'name',    label: 'name', get: r => r.share_name },
      { key: 'comment', label: 'comment', grow: true },
      { key: 'type',    label: 'type' },
    ],
    actions: r => [
      { label: 'list', command: 'ls', params: () => `\\\\${r.computer_name}\\${r.share_name}`, disabled: () => !r.readable },
    ],
  },

  // ── list_registered_files → remove_registered_file ──
  // rows are bare filename strings
  list_registered_files: {
    title: 'Files Registered in Memory',
    columns: [
      { key: 'name', label: 'name', get: r => (typeof r === 'string' ? r : r.name), grow: true },
    ],
    actions: r => {
      const name = typeof r === 'string' ? r : r.name
      return [
        { label: 'remove', command: 'remove_registered_file', params: () => JSON.stringify({ file_name: name }), danger: true },
      ]
    },
  },

  // ── reg_query → reg_query (drill into subkeys) ──────
  reg_query: {
    title: 'Registry',
    columns: [
      { key: 'name',  label: 'name' },
      { key: 'type',  label: 'type', get: r => r.value_type },
      { key: 'value', label: 'value', copy: true, grow: true },
    ],
    actions: r => {
      const full = (r.full_name?.[0] === '\\') ? `${r.hive}:${r.full_name}` : `${r.hive}:\\${r.full_name}`
      return [
        { label: 'query', command: 'reg_query', params: () => full, disabled: () => r.result_type !== 'key' },
      ]
    },
  },

  // ── ticket_cache_list → extract / purge / add ───────
  ticket_cache_list: {
    title: 'Cached Kerberos Tickets',
    columns: [
      { key: 'client',  label: 'client',  get: r => `${r.client_name}@${r.client_realm}`, copy: true },
      { key: 'service', label: 'service', get: r => `${r.service_name}@${r.service_realm}`, copy: true },
      { key: 'luid',    label: 'luid' },
      { key: 'end',     label: 'end', get: r => r.end_time },
    ],
    actions: r => [
      { label: 'extract', command: 'ticket_cache_extract', params: () => JSON.stringify({ service: r.service_name, luid: r.luid }) },
      { label: 'purge',   command: 'ticket_cache_purge',   params: () => JSON.stringify({ serviceName: `${r.service_name}@${r.service_realm}`, luid: r.luid }), confirm: 'Purge this cached ticket?', danger: true },
    ],
    footerActions: [{ label: 'add ticket', command: 'ticket_cache_add' }],
  },

  // ── ticket_store_list → purge / add ─────────────────
  ticket_store_list: {
    title: 'Stored Kerberos Tickets',
    columns: [
      { key: 'client',  label: 'client',  get: r => r.client_fullname, copy: true },
      { key: 'service', label: 'service', get: r => r.service_fullname, copy: true },
      { key: 'end',     label: 'end', get: r => r.end_time },
      { key: 'ticket',  label: 'ticket', copy: true },
    ],
    actions: r => [
      { label: 'purge', command: 'ticket_store_purge', params: () => JSON.stringify({ serviceName: r.service_fullname }), confirm: 'Purge this stored ticket?', danger: true },
    ],
    footerActions: [{ label: 'add ticket', command: 'ticket_store_add' }],
  },
}
