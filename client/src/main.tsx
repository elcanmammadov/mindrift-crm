import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { I18nProvider } from './lib/i18n';
import { AuthProvider, useAuth } from './lib/auth';
import { ApiError } from './lib/api';
import { Spinner, ToastProvider } from './components/ui';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { CustomersPage } from './pages/Customers';
import { CustomerDetailPage } from './pages/CustomerDetail';
import { CaseDetailPage } from './pages/CaseDetail';
import { BoardPage } from './pages/Board';
import { HandoversPage } from './pages/Handovers';
import { InsightsPage } from './pages/Insights';
import { SettingsPage } from './pages/Settings';
import { IntegrationsPage } from './pages/Integrations';
import { CustomerPortalPage } from './pages/CustomerPortal';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ToastProvider>
          <BrowserRouter>
            <AuthProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                {/* Customer-facing, token-only pages: no staff session, no navigation. */}
                <Route path="/c/:token" element={<CustomerPortalPage />} />
                <Route
                  element={
                    <RequireAuth>
                      <Layout />
                    </RequireAuth>
                  }
                >
                  <Route index element={<DashboardPage />} />
                  <Route path="customers" element={<CustomersPage />} />
                  <Route path="customers/:id" element={<CustomerDetailPage />} />
                  <Route path="cases/:id" element={<CaseDetailPage />} />
                  <Route path="board" element={<BoardPage />} />
                  <Route path="handovers" element={<HandoversPage />} />
                  <Route path="insights" element={<InsightsPage />} />
                  <Route path="integrations" element={<IntegrationsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
