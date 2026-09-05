import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProductsPage } from './pages/ProductsPage';
import { ArtworkPage } from './pages/ArtworkPage';
import { ComparisonPage } from './pages/ComparisonPage';
import { ComparisonDetailPage } from './pages/ComparisonDetailPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { QAPage } from './pages/QAPage';
import { ReportsPage } from './pages/ReportsPage';
import { MasterDataPage } from './pages/MasterDataPage';
import { UsersPage } from './pages/UsersPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProfilePage } from './pages/ProfilePage';

function RootRedirect() {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
}

function LoginRoute() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <LoginPage />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginRoute />} />

      <Route path="/dashboard" element={<ProtectedRoute moduleId="dashboard"><DashboardPage /></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute moduleId="products"><ProductsPage /></ProtectedRoute>} />
      <Route path="/artwork" element={<ProtectedRoute moduleId="artwork"><ArtworkPage /></ProtectedRoute>} />
      <Route path="/comparison" element={<ProtectedRoute moduleId="comparison"><ComparisonPage /></ProtectedRoute>} />
      <Route path="/comparison/:id" element={<ProtectedRoute moduleId="comparison"><ComparisonDetailPage /></ProtectedRoute>} />
      <Route path="/approvals" element={<ProtectedRoute moduleId="approvals"><ApprovalsPage /></ProtectedRoute>} />
      <Route path="/qa" element={<ProtectedRoute moduleId="qa-verification"><QAPage /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute moduleId="reports"><ReportsPage /></ProtectedRoute>} />
      <Route path="/master-data" element={<ProtectedRoute moduleId="masters"><MasterDataPage /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute moduleId="users"><UsersPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute moduleId="settings"><SettingsPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}

export default App;
