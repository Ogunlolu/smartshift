import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import LoginPage from '@/pages/LoginPage';
import StaffDashboard from '@/pages/StaffDashboard';
import ManagerDashboard from '@/pages/ManagerDashboard';
import Layout from '@/components/Layout';

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole?: string }) {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user, isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to="/" replace />
          ) : (
            <LoginPage />
          )
        }
      />
      
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              {user?.role === 'STAFF' && <StaffDashboard />}
              {(user?.role === 'MANAGER' || user?.role === 'ADMIN') && <ManagerDashboard />}
            </Layout>
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/staff"
        element={
          <ProtectedRoute requiredRole="STAFF">
            <Layout>
              <StaffDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/manager"
        element={
          <ProtectedRoute>
            <Layout>
              <ManagerDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
