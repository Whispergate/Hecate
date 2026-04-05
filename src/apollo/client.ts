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
          error: (err) => console.error('[WS] error', err),
          closed: () => console.warn('[WS] closed'),
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
    return getWsLink().request(operation, forward)
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
const cache = new InMemoryCache({
  typePolicies: {
    Query: { fields: { callback: { keyArgs: ['id'] } } },
  },
})

// ── Apollo Client ─────────────────────────────────────
export const apolloClient = new ApolloClient({
  link: from([errorLink, splitLink]),
  cache,
  defaultOptions: { watchQuery: { fetchPolicy: 'cache-and-network' } },
})

// ── Login ─────────────────────────────────────────────
export async function mythicLogin(
  username: string,
  password: string
): Promise<boolean> {
  try {
    const res = await fetch(AUTH_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password }),
    })
    const text = await res.text()
    if (!res.ok) {
      console.error('[Login] HTTP', res.status, text)
      return false
    }
    const data = JSON.parse(text)
    const token = data.access_token
    if (!token) {
      console.error('[Login] No access_token:', data)
      return false
    }
    sessionStorage.setItem('hecate_token', token)
    return true
  } catch (e) {
    console.error('[Login] fetch failed:', e)
    return false
  }
}

// ── Logout ────────────────────────────────────────────
export function mythicLogout() {
  sessionStorage.removeItem('hecate_token')
  _wsLink = null
  apolloClient.clearStore()
}
