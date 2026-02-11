import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Login from './pages/Login';
import Register from './pages/Register';
import AnnouncementBar from './components/AnnouncementBar';
import Footer from './components/Footer';

const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Settings = React.lazy(() => import('./pages/Settings'));
const StockPrediction = React.lazy(() => import('./pages/StockPrediction'));
const MBTITest = React.lazy(() => import('./pages/MBTITest'));
const FriendMatch = React.lazy(() => import('./pages/FriendMatch'));
const Doudizhu = React.lazy(() => import('./pages/Doudizhu'));

const LoadingFallback: React.FC = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }} role="status" aria-live="polite">
    <span>加载中...</span>
  </div>
);

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  return token ? <><AnnouncementBar />{children}</> : <Navigate to="/login" />;
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <div className="app-wrapper">
            <div className="app-content">
              <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route
                    path="/"
                    element={
                      <PrivateRoute>
                        <Dashboard />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <PrivateRoute>
                        <Settings />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="/stock-prediction"
                    element={
                      <PrivateRoute>
                        <StockPrediction />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="/mbti-test"
                    element={
                      <PrivateRoute>
                        <MBTITest />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="/friend-match"
                    element={
                      <PrivateRoute>
                        <FriendMatch />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="/doudizhu"
                    element={
                      <PrivateRoute>
                        <Doudizhu />
                      </PrivateRoute>
                    }
                  />
                </Routes>
              </Suspense>
            </div>
            <Footer />
          </div>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
