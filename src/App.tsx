import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AppDataProvider } from '@/context/AppDataContext'
import { AuthProvider } from '@/context/AuthContext'
import { ToastProvider } from '@/context/ToastContext'
import { LoginPage } from '@/pages/auth/LoginPage'

const DashboardPage = lazy(() => import('@/pages/admin/DashboardPage'))
const ProductsPage = lazy(() => import('@/pages/admin/ProductsPage'))
const ProductDetailPage = lazy(() => import('@/pages/admin/ProductDetailPage'))
const ProductFormPage = lazy(() => import('@/pages/admin/ProductFormPage'))
const CategoriesPage = lazy(() => import('@/pages/admin/CategoriesPage'))
const AttributesPage = lazy(() => import('@/pages/admin/AttributesPage'))
const CollectionsPage = lazy(() => import('@/pages/admin/CollectionsPage'))
const CustomersPage = lazy(() => import('@/pages/admin/CustomersPage'))
const CustomerDetailPage = lazy(() => import('@/pages/admin/CustomerDetailPage'))
const CustomerFormPage = lazy(() => import('@/pages/admin/CustomerFormPage'))
const CataloguesPage = lazy(() => import('@/pages/admin/CataloguesPage'))
const CatalogueBuilderPage = lazy(() => import('@/pages/admin/CatalogueBuilderPage'))
const CatalogueDetailPage = lazy(() => import('@/pages/admin/CatalogueDetailPage'))
const EnquiriesPage = lazy(() => import('@/pages/admin/EnquiriesPage'))
const EnquiryDetailPage = lazy(() => import('@/pages/admin/EnquiryDetailPage'))
const AnalyticsPage = lazy(() => import('@/pages/admin/AnalyticsPage'))
const SettingsPage = lazy(() => import('@/pages/admin/SettingsPage'))

const CustomerCataloguePage = lazy(() => import('@/pages/catalogue/CustomerCataloguePage'))
const CatalogueProductDetailPage = lazy(() => import('@/pages/catalogue/CatalogueProductDetailPage'))
const CatalogueSelectionPage = lazy(() => import('@/pages/catalogue/CatalogueSelectionPage'))
const EnquirySuccessPage = lazy(() => import('@/pages/catalogue/EnquirySuccessPage'))

function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-stone-900" />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppDataProvider>
        <ToastProvider>
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />

                <Route path="/catalogue/:slug" element={<CustomerCataloguePage />} />
                <Route path="/catalogue/:slug/product/:productId" element={<CatalogueProductDetailPage />} />
                <Route path="/catalogue/:slug/selection" element={<CatalogueSelectionPage />} />
                <Route path="/catalogue/:slug/enquiry-success" element={<EnquirySuccessPage />} />

                <Route element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<DashboardPage />} />

                  <Route path="/products" element={<ProductsPage />} />
                  <Route path="/products/new" element={<ProductFormPage />} />
                  <Route path="/products/:id" element={<ProductDetailPage />} />
                  <Route path="/products/:id/edit" element={<ProductFormPage />} />

                  <Route path="/categories" element={<CategoriesPage />} />
                  <Route path="/attributes" element={<AttributesPage />} />
                  <Route path="/inventory/low-stock" element={<Navigate to="/products" replace />} />
                  <Route path="/inventory/collections" element={<CollectionsPage />} />

                  <Route path="/customers" element={<CustomersPage />} />
                  <Route path="/customers/new" element={<CustomerFormPage />} />
                  <Route path="/customers/:id" element={<CustomerDetailPage />} />
                  <Route path="/customers/:id/edit" element={<CustomerFormPage />} />

                  <Route path="/catalogues" element={<CataloguesPage />} />
                  <Route path="/catalogues/new" element={<CatalogueBuilderPage />} />
                  <Route path="/catalogues/:id" element={<CatalogueDetailPage />} />

                  <Route path="/enquiries" element={<EnquiriesPage />} />
                  <Route path="/enquiries/:id" element={<EnquiryDetailPage />} />

                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>

                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ToastProvider>
      </AppDataProvider>
    </AuthProvider>
  )
}
