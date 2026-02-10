import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import StockPrediction from './pages/StockPrediction';
import MBTITest from './pages/MBTITest';
import FriendMatch from './pages/FriendMatch';
import AnnouncementBar from './components/AnnouncementBar';
import Footer from './components/Footer';

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
              </Routes>
            </div>
            <Footer />
          </div>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
