/* ═══════════════════════════════════════════════════
   hecate/src/App.tsx
   ═══════════════════════════════════════════════════ */

import { ApolloProvider } from '@apollo/client'
import { apolloClient }   from './apollo/client'
import { useStore }       from './store'
import { Login }          from './views/Login'
import { Dashboard }      from './views/Dashboard'

export default function App() {
  const token = useStore((s) => s.token)

  return (
    <ApolloProvider client={apolloClient}>
      {token ? <Dashboard /> : <Login />}
    </ApolloProvider>
  )
}
