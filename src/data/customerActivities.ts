import type { CustomerActivity } from '@/types'

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
export const CUSTOMER_ACTIVITIES: CustomerActivity[] = [
  { id: 'activity-1', customerId: 'cust-1', type: 'viewed_catalogue', title: 'Viewed September New Arrivals', detail: 'Private catalogue opened', createdAt: minutesAgo(9), link: '/catalogues/cat-log-1' },
  { id: 'activity-2', customerId: 'cust-1', type: 'viewed_product', title: 'Viewed K-101 Floral Rayon Kurti', detail: 'Product detail viewed', createdAt: minutesAgo(6), link: '/products/prod-101' },
  { id: 'activity-3', customerId: 'cust-1', type: 'selected_products', title: 'Selected 4 designs', detail: '8 variants added to selection', createdAt: minutesAgo(4) },
  { id: 'activity-4', customerId: 'cust-1', type: 'submitted_enquiry', title: 'Submitted enquiry ENQ-2026-0018', detail: '144 pieces requested', createdAt: minutesAgo(1), link: '/enquiries/enq-1' },
  { id: 'activity-5', customerId: 'cust-1', type: 'catalogue_sent', title: 'Catalogue sent on WhatsApp', detail: 'September New Arrivals', createdAt: minutesAgo(35) },
]
