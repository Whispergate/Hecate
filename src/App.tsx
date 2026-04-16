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

const FONT_SCALE = { small: '0.9', normal: '1', large: '1.2' } as const

export default function App() {
  const token           = useStore((s) => s.token)
  const activeOperation = useStore((s) => s.activeOperation)
  const theme           = useStore((s) => s.theme)
  const fontSize        = useStore((s) => s.settings.fontSize)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', FONT_SCALE[fontSize])
  }, [fontSize])

  return (
    <ApolloProvider client={apolloClient}>
      {!token && <Login />}
      {token && !activeOperation && <OperationSelect />}
      {token && activeOperation && <Dashboard />}
    </ApolloProvider>
  )
}
