import { Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Approvals from './pages/Approvals'
import Dashboard from './pages/Dashboard'
import Equipment from './pages/Equipment'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Programs from './pages/Programs'
import Reports from './pages/Reports'
import Transactions from './pages/Transactions'
import Users from './pages/Users'

// The map of the site: which page shows at which address.
// Pages nested inside <ProtectedRoute> need an admin login and share the side menu.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route index element={<Dashboard />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="users" element={<Users />} />
        <Route path="equipment" element={<Equipment />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="reports" element={<Reports />} />
        <Route path="programs" element={<Programs />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
