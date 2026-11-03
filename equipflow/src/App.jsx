import { Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Browse from './pages/Browse'
import Fines from './pages/Fines'
import Home from './pages/Home'
import Login from './pages/Login'
import MyLoans from './pages/MyLoans'
import NotFound from './pages/NotFound'
import Profile from './pages/Profile'
import Recommended from './pages/Recommended'
import Register from './pages/Register'

// The map of the app: which page shows at which address.
// Pages nested inside <ProtectedRoute> need a login and share the top bar and tab bar.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<ProtectedRoute />}>
        <Route index element={<Home />} />
        <Route path="loans" element={<MyLoans />} />
        <Route path="fines" element={<Fines />} />
        <Route path="recommended" element={<Recommended />} />
        <Route path="browse" element={<Browse />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
