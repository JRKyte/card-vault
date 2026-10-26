import { useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Nav } from './components/Nav'
import { keys, useUser } from './lib/queries'
import { useDailySnapshot } from './lib/snapshot'
import { store } from './lib/store'
import { AddCard } from './screens/AddCard'
import { CustomSetEditor } from './screens/CustomSetEditor'
import { Dashboard } from './screens/Dashboard'
import { Login } from './screens/Login'
import { Search } from './screens/Search'
import { SetDetail } from './screens/SetDetail'
import { Sets } from './screens/Sets'
import { Settings } from './screens/Settings'

// The chart library is heavy; only load it when the Value screen opens.
const Value = lazy(() => import('./screens/Value').then((m) => ({ default: m.Value })))

export function App() {
  const qc = useQueryClient()
  const user = useUser()

  useEffect(
    () =>
      store.onAuthChange(() => {
        qc.invalidateQueries({ queryKey: keys.user })
      }),
    [qc],
  )

  if (user.isLoading) return null
  if (!user.data) {
    return <Login />
  }
  return <SignedIn />
}

function SignedIn() {
  useDailySnapshot()
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  const hideNav = pathname.startsWith('/custom/new') || /^\/custom\/[^/]+\/edit/.test(pathname)
  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sets" element={<Sets />} />
        <Route path="/set/:id" element={<SetDetail kind="official" />} />
        <Route path="/custom/new" element={<CustomSetEditor />} />
        <Route path="/custom/:id/edit" element={<CustomSetEditor />} />
        <Route path="/custom/:id" element={<SetDetail kind="custom" />} />
        <Route path="/add" element={<Search />} />
        <Route path="/add/:cardId" element={<AddCard mode="add" />} />
        <Route path="/card/:cardId" element={<AddCard mode="edit" />} />
        <Route
          path="/value"
          element={
            <Suspense fallback={null}>
              <Value />
            </Suspense>
          }
        />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!hideNav && <Nav />}
    </>
  )
}
