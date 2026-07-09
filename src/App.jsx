import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar/Navbar';
import Footer from './components/Footer/Footer';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import ManagerDashboardPage from './pages/ManagerDashboardPage';
import ShiftAssignmentPage from './pages/ShiftAssignmentPage';
import CustomerBookingPage from './pages/CustomerBookingPage';
import BookingSuccessPage from './pages/BookingSuccessPage';
import EmployeeAvailabilityPage from './pages/EmployeeAvailabilityPage';
import MyShiftsPage from './pages/MyShiftsPage';
import AboutPage from './pages/AboutPage';
import ServiceManagementPage from './pages/ServiceManagementPage';
import RecommendationsPage from './pages/RecommendationsPage';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';

function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />
      <main style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/book/:businessId" element={<CustomerBookingPage />} />
          <Route path="/book/:businessId/success" element={<BookingSuccessPage />} />
          
          <Route path="/admin/dashboard" element={
            <ProtectedRoute allowedRoles={['Admin']}>
              <ManagerDashboardPage />
            </ProtectedRoute>
          } />
          <Route path="/admin/assign/:shiftId?" element={
            <ProtectedRoute allowedRoles={['Admin']}>
              <ShiftAssignmentPage />
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
          
          <Route path="/admin/services" element={
            <ProtectedRoute allowedRoles={['Admin']}>
              <ServiceManagementPage />
            </ProtectedRoute>
          } />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default App;
