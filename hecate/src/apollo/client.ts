/* ═══════════════════════════════════════════════════
   hecate/src/apollo/client.ts

   Apollo Client wired to Mythic's GraphQL endpoint.
   Mythic exposes:
     HTTP  → https://<host>:7443/graphql
     WS    → wss://<host>:7443/graphql  (subscriptions)
   ═══════════════════════════════════════════════════ */

import {
  ApolloClient,
  InMemoryCache,
  split,
  HttpLink,
  from,
} from '@apollo/client'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { getMainDefinition }  from '@apollo/client/utilities'
import { setContext }          from '@apollo/client/link/context'
import { onError }             from '@apollo/client/link/error'
import { createClient }        from 'graphql-ws'

// ── Config ────────────────────────────────────────────
// Set VITE_MYTHIC_HOST in your .env  (default: localhost:7443)
const MYTHIC_HOST = import.meta.env.VITE_MYTHIC_HOST ?? 'localhost:7443'
const HTTP_URL    = `https://${MYTHIC_HOST}/graphql`
const WS_URL      = `wss://${MYTHIC_HOST}/graphql`

// ── Auth header link ──────────────────────────────────
// Mythic uses a Bearer token obtained from /auth/login.
// Store the token in sessionStorage after login.
const authLink = setContext((_, { headers }) => {
  const token = sessionStorage.getItem('hecate_token') ?? ''
  return {
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }
})

// ── HTTP link (queries + mutations) ──────────────────
const httpLink = new HttpLink({
  uri: HTTP_URL,
  // Mythic uses a self-signed cert in dev — disable verification
  // In production swap for a real cert and remove this
  fetchOptions: { credentials: 'include' },
})

// ── WebSocket link (subscriptions) ───────────────────
const wsLink = new GraphQLWsLink(
  createClient({
    url: WS_URL,
    connectionParams: () => {
      const token = sessionStorage.getItem('hecate_token') ?? ''
      return token ? { Authorization: `Bearer ${token}` } : {}
    },
    // Reconnect automatically on drop
    shouldRetry: () => true,
    retryAttempts: Infinity,
    retryWait: async (attempt) => {
      // Exponential backoff capped at 30s
      await new Promise(r => setTimeout(r, Math.min(1000 * 2 ** attempt, 30_000)))
    },
  })
)

// ── Split: subscriptions → WS, everything else → HTTP ─
const splitLink = split(
  ({ query }) => {
    const def = getMainDefinition(query)
    return def.kind === 'OperationDefinition' && def.operation === 'subscription'
  },
  wsLink,
  from([authLink, httpLink])
)

// ── Error link ────────────────────────────────────────
const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    graphQLErrors.forEach(({ message, locations, path }) =>
      console.error(`[GraphQL] ${message}`, { locations, path })
    )
  }
  if (networkError) console.error(`[Network] ${networkError}`)
})

// ── Cache ─────────────────────────────────────────────
const cache = new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        // Callbacks keyed by id so updates merge cleanly
        callback: { keyArgs: ['id'] },
      },
    },
  },
})

// ── Client ────────────────────────────────────────────
export const apolloClient = new ApolloClient({
  link: from([errorLink, splitLink]),
  cache,
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
  },
})

// ── Helper: authenticate and store token ─────────────
export async function mythicLogin(username: string, password: string): Promise<boolean> {
  try {
    const res = await fetch(`https://${MYTHIC_HOST}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) return false
    const { access_token } = await res.json()
    sessionStorage.setItem('hecate_token', access_token)
    return true
  } catch {
    return false
  }
}

export function mythicLogout() {
  sessionStorage.removeItem('hecate_token')
  apolloClient.clearStore()
}
