/* ═══════════════════════════════════════════════════
   hecate/src/apollo/client.ts

   Mythic v3:
     Auth:    POST /auth  → { access_token }
     GraphQL: POST /graphql  Authorization: Bearer <token>
     WS:      ws(s)://host/graphql  connectionParams.headers.Authorization

   All URLs are relative — proxied through nginx → socat → Mythic:7443
   ═══════════════════════════════════════════════════ */

import {
  ApolloClient,
  InMemoryCache,
  split,
  HttpLink,
  from,
  ApolloLink,
} from '@apollo/client'
import { GraphQLWsLink }    from '@apollo/client/link/subscriptions'
import { getMainDefinition } from '@apollo/client/utilities'
import { setContext }        from '@apollo/client/link/context'
import { onError }           from '@apollo/client/link/error'
import { createClient }      from 'graphql-ws'
import { useStore }          from '@/store'

const HTTP_URL = '/graphql/'
const AUTH_URL = '/auth'
const WS_PROTO = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const WS_URL   = `${WS_PROTO}//${window.location.host}/graphql/`

// ── Auth header: Authorization: Bearer <JWT> ──────────
const authLink = setContext((_, { headers }) => {
  const token = sessionStorage.getItem('hecate_token') ?? ''
  return {
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }
})

// ── HTTP link ─────────────────────────────────────────
const httpLink = new HttpLink({ uri: HTTP_URL })

// ── WebSocket link — created lazily, only when first subscription fires
// This prevents a failed WS from blocking HTTP queries/mutations
let _wsLink: GraphQLWsLink | null = null

function getWsLink(): GraphQLWsLink {
  if (!_wsLink) {
    _wsLink = new GraphQLWsLink(
      createClient({
        url: WS_URL,
        lazy: true,
        connectionParams: () => {
          const token = sessionStorage.getItem('hecate_token') ?? ''
          return token
            ? { headers: { Authorization: `Bearer ${token}` } }
            : {}
        },
        shouldRetry: () => true,
        retryAttempts: 10,
        retryWait: async (attempt: number) => {
          await new Promise(r =>
            setTimeout(r, Math.min(1000 * 2 ** attempt, 30_000))
          )
        },
        on: {
          connecting: () => useStore.getState().setMythicConnection('connecting'),
          connected:  () => useStore.getState().setMythicConnection('connected'),
          closed: () => {
            console.warn('[WS] closed')
            useStore.getState().setMythicConnection('disconnected')
          },
          error: (err) => {
            console.error('[WS] error', err)
            useStore.getState().setMythicConnection('disconnected')
          },
        },
      })
    )
  }
  return _wsLink
}

// ── Directional link: subscriptions → WS, rest → HTTP ─
const splitLink = new ApolloLink((operation, forward) => {
  const def = getMainDefinition(operation.query)
  const isSubscription =
    def.kind === 'OperationDefinition' && def.operation === 'subscription'

  if (isSubscription) {
    return getWsLink().request(operation)
  }
  return from([authLink, httpLink]).request(operation, forward)
})

// ── Error link ────────────────────────────────────────
const errorLink = onError(({ graphQLErrors, networkError, operation }) => {
  if (graphQLErrors) {
    graphQLErrors.forEach(({ message, locations, path }) =>
      console.error(`[GraphQL error] op=${operation.operationName} msg=${message}`, { locations, path })
    )
  }
  if (networkError) {
    console.error(`[Network error] op=${operation.operationName}`, networkError)
  }
})

// ── Cache ─────────────────────────────────────────────
const cache = new InMemoryCache()

// ── Apollo Client ─────────────────────────────────────
export const apolloClient = new ApolloClient({
  link: from([errorLink, splitLink]),
  cache,
  defaultOptions: { watchQuery: { fetchPolicy: 'cache-and-network' } },
})

// ── Login ─────────────────────────────────────────────
export interface LoginResult {
  success: boolean
  userId:  number | null
}

export async function mythicLogin(
  username: string,
  password: string
): Promise<LoginResult> {
  try {
    const res = await fetch(AUTH_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password }),
    })
    const text = await res.text()
    if (!res.ok) {
      console.error('[Login] HTTP', res.status, text)
      return { success: false, userId: null }
    }
    const data = JSON.parse(text)
    const token  = data.access_token
    const userId = data.user?.user_id ?? null
    if (!token) {
      console.error('[Login] No access_token:', data)
      return { success: false, userId: null }
    }
    sessionStorage.setItem('hecate_token', token)
    return { success: true, userId }
  } catch (e) {
    console.error('[Login] fetch failed:', e)
    return { success: false, userId: null }
  }
}

// ── Logout ────────────────────────────────────────────
// Dispose WS client so next subscription reconnects with fresh Hasura claims.
// Call after updateCurrentOperation succeeds.
export function resetWsLink() {
  if (_wsLink) {
    // graphql-ws client has a dispose method on the underlying client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(_wsLink as any).client?.dispose?.()
    _wsLink = null
    useStore.getState().setMythicConnection('idle')
  }
}

export function mythicLogout() {
  sessionStorage.removeItem('hecate_token')
  sessionStorage.removeItem('hecate_user_id')
  _wsLink = null
  useStore.getState().setMythicConnection('idle')
  apolloClient.clearStore()
}
