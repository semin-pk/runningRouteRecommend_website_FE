/**
 * App with React Router setup.
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App.jsx'
import Login from './pages/Login.jsx'
import LoginSuccess from './pages/LoginSuccess.jsx'
import MyPage from './pages/MyPage.jsx'
import ProfileEdit from './pages/ProfileEdit.jsx'
import MyStoresPage from './pages/MyStoresPage.jsx'

function AppWithRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/login/success" element={<LoginSuccess />} />
        <Route path="/mypage" element={<MyPage />} />
        <Route path="/mypage/profile/edit" element={<ProfileEdit />} />
        <Route path="/mypage/stores" element={<MyStoresPage />} />
        <Route path="/" element={<App />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default AppWithRouter














