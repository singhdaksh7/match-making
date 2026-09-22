import type { Notification } from '@/types'

function hoursAgoIso(hours: number) {
  const d = new Date()
  d.setHours(d.getHours() - hours)
  return d.toISOString()
}

export const NOTIFICATIONS: Notification[] = [
  { id: 'notif-1', type: 'enquiry', title: 'New enquiry received', message: 'Raj Fashion House submitted a new enquiry.', read: false, createdAt: hoursAgoIso(1), link: '/enquiries/enq-1' },
  { id: 'notif-2', type: 'low_stock', title: 'Low stock alert', message: 'K-103 Maroon XL is low on stock.', read: false, createdAt: hoursAgoIso(4), link: '/inventory/low-stock' },
  { id: 'notif-3', type: 'catalogue_view', title: 'Catalogue viewed', message: 'Gupta Garments viewed September Collection.', read: false, createdAt: hoursAgoIso(9), link: '/catalogues/cat-log-1' },
  { id: 'notif-4', type: 'catalogue_milestone', title: 'Catalogue milestone', message: 'New catalogue reached 25 views.', read: true, createdAt: hoursAgoIso(30), link: '/catalogues/cat-log-5' },
  { id: 'notif-5', type: 'enquiry', title: 'Enquiry converted', message: 'Delhi Fashion Hub confirmed their order.', read: true, createdAt: hoursAgoIso(48), link: '/enquiries/enq-5' },
  { id: 'notif-6', type: 'low_stock', title: 'Low stock alert', message: 'DN-504 Black 32 has only 3 pieces left.', read: true, createdAt: hoursAgoIso(60), link: '/inventory/low-stock' },
]
