import { lazy, Suspense, useLayoutEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar/Navbar';
import Footer from './components/Footer/Footer';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import LoadingSpinner from './components/LoadingSpinner/LoadingSpinner';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ManagerDashboardPage = lazy(() => import('./pages/ManagerDashboardPage'));
const ShiftAssignmentPage = lazy(() => import('./pages/ShiftAssignmentPage'));
const CustomerBookingPage = lazy(() => import('./pages/CustomerBookingPage'));
const BookingSuccessPage = lazy(() => import('./pages/BookingSuccessPage'));
const BookingManagePage = lazy(() => import('./pages/BookingManagePage'));
const EmployeeAvailabilityPage = lazy(() => import('./pages/EmployeeAvailabilityPage'));
const MyShiftsPage = lazy(() => import('./pages/MyShiftsPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ServiceManagementPage = lazy(() => import('./pages/ServiceManagementPage'));
const TeamPage = lazy(() => import('./pages/TeamPage'));
const RecommendationsPage = lazy(() => import('./pages/RecommendationsPage'));
const EmployeeProfilePage = lazy(() => import('./pages/EmployeeProfilePage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function App() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">דלג לתוכן הראשי</a>
      <Navbar />
      <main id="main-content" className="app-main">
        <Suspense fallback={<LoadingSpinner text="טוען עמוד..." />}>
          <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/book" element={<CustomerBookingPage />} />
          <Route path="/book/success" element={<BookingSuccessPage />} />
          <Route path="/book/manage" element={<BookingManagePage />} />
          {/* Legacy multi-tenant-style links keep working */}
          <Route path="/book/:businessId" element={<Navigate to="/book" replace />} />
          <Route path="/book/:businessId/success" element={<Navigate to="/book/success" replace />} />

          <Route path="/admin/dashboard" element={
            <ProtectedRoute allowedRoles={['Admin']}>
              <ManagerDashboardPage />
            </ProtectedRoute>
          } />
          <Route path="/admin/assign" element={
            <ProtectedRoute allowedRoles={['Admin']}>
              <ShiftAssignmentPage />
            </ProtectedRoute>
          } />
          <Route path="/admin/services" element={
            <ProtectedRoute allowedRoles={['Admin']}>
              <ServiceManagementPage />
            </ProtectedRoute>
          } />
          <Route path="/admin/team" element={
            <ProtectedRoute allowedRoles={['Admin']}>
              <TeamPage />
            </ProtectedRoute>
          } />

          <Route path="/employee/availability" element={
            <ProtectedRoute allowedRoles={['Employee', 'Admin']}>
              <EmployeeAvailabilityPage />
            </ProtectedRoute>
          } />
          <Route path="/employee/shifts" element={
            <ProtectedRoute allowedRoles={['Employee', 'Admin']}>
              <MyShiftsPage />
            </ProtectedRoute>
          } />
          <Route path="/employee/recommendations" element={
            <ProtectedRoute allowedRoles={['Employee', 'Admin']}>
              <RecommendationsPage />
            </ProtectedRoute>
          } />
          <Route path="/employee/profile" element={
            <ProtectedRoute allowedRoles={['Employee', 'Admin']}>
              <EmployeeProfilePage />
            </ProtectedRoute>
          } />

          <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}

export default App;
