/* ═══════════════════════════════════════════════════
   hecate/src/App.tsx
   Flow: Login → OperationSelect → Dashboard
   ═══════════════════════════════════════════════════ */

import { useEffect }          from 'react'
import { ApolloProvider }    from '@apollo/client'
import { apolloClient }      from './apollo/client'
import { useStore }          from './store'
import { Login }             from './views/Login'
import { OperationSelect }   from './views/OperationSelect'
import { Dashboard }         from './views/Dashboard'

export default function App() {
  const token           = useStore((s) => s.token)
  const activeOperation = useStore((s) => s.activeOperation)
  const theme           = useStore((s) => s.theme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <ApolloProvider client={apolloClient}>
      {!token && <Login />}
      {token && !activeOperation && <OperationSelect />}
      {token && activeOperation && <Dashboard />}
    </ApolloProvider>
  )
}
