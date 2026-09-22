import type { Customer, CustomerType } from '@/types'

function daysAgoIso(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

interface SeedCustomer {
  businessName: string
  contactPerson: string
  city: string
  state: string
  type: CustomerType
  daysAgo: number
  lastActivity: number
}

const SEED: SeedCustomer[] = [
  { businessName: 'Raj Fashion House', contactPerson: 'Rajesh Kumar', city: 'Delhi', state: 'Delhi', type: 'Wholesaler', daysAgo: 210, lastActivity: 0 },
  { businessName: 'Gupta Garments', contactPerson: 'Sanjay Gupta', city: 'Delhi', state: 'Delhi', type: 'Wholesaler', daysAgo: 180, lastActivity: 3 },
  { businessName: 'Shree Balaji Collection', contactPerson: 'Balaji Rao', city: 'Hyderabad', state: 'Telangana', type: 'Distributor', daysAgo: 165, lastActivity: 5 },
  { businessName: 'Fashion Point', contactPerson: 'Neha Sharma', city: 'Jaipur', state: 'Rajasthan', type: 'Retailer', daysAgo: 150, lastActivity: 2 },
  { businessName: 'RK Garments', contactPerson: 'Ramesh Kumar', city: 'Ludhiana', state: 'Punjab', type: 'Wholesaler', daysAgo: 140, lastActivity: 8 },
  { businessName: 'Mehta Fashion', contactPerson: 'Kavita Mehta', city: 'Ahmedabad', state: 'Gujarat', type: 'Reseller', daysAgo: 120, lastActivity: 12 },
  { businessName: 'Delhi Fashion Hub', contactPerson: 'Anil Khanna', city: 'Delhi', state: 'Delhi', type: 'Wholesaler', daysAgo: 110, lastActivity: 4 },
  { businessName: 'Aarav Clothing', contactPerson: 'Aarav Patel', city: 'Surat', state: 'Gujarat', type: 'Distributor', daysAgo: 95, lastActivity: 6 },
  { businessName: 'Krishna Collection', contactPerson: 'Priya Iyer', city: 'Chennai', state: 'Tamil Nadu', type: 'Retailer', daysAgo: 88, lastActivity: 15 },
  { businessName: 'Om Sai Textiles', contactPerson: 'Vikram Joshi', city: 'Pune', state: 'Maharashtra', type: 'Wholesaler', daysAgo: 75, lastActivity: 9 },
  { businessName: 'New Age Apparels', contactPerson: 'Simran Kaur', city: 'Chandigarh', state: 'Punjab', type: 'Reseller', daysAgo: 60, lastActivity: 20 },
  { businessName: 'Shubham Traders', contactPerson: 'Deepak Agarwal', city: 'Indore', state: 'Madhya Pradesh', type: 'Wholesaler', daysAgo: 50, lastActivity: 7 },
  { businessName: 'Sitara Fashion World', contactPerson: 'Fatima Shaikh', city: 'Mumbai', state: 'Maharashtra', type: 'Distributor', daysAgo: 40, lastActivity: 2 },
  { businessName: 'Vishal Garments', contactPerson: 'Vishal Bansal', city: 'Kanpur', state: 'Uttar Pradesh', type: 'Retailer', daysAgo: 25, lastActivity: 11 },
  { businessName: 'Trendy Threads Co.', contactPerson: 'Meera Nair', city: 'Kochi', state: 'Kerala', type: 'Reseller', daysAgo: 14, lastActivity: 1 },
]

export const CUSTOMERS: Customer[] = SEED.map((c, i) => {
  const phone = `9${(800000000 + i * 137).toString().slice(0, 9)}`
  return {
    id: `cust-${i + 1}`,
    businessName: c.businessName,
    contactPerson: c.contactPerson,
    phone: `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`,
    whatsapp: `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`,
    email: `${c.contactPerson.toLowerCase().replace(/\s+/g, '.')}@${c.businessName.toLowerCase().replace(/[^a-z]+/g, '')}.com`,
    city: c.city,
    state: c.state,
    type: c.type,
    gstNumber: `24ABCDE${1000 + i}F1Z${i % 10}`,
    notes: i % 4 === 0 ? 'Prefers festive & embroidered collections.' : undefined,
    status: 'active',
    createdAt: daysAgoIso(c.daysAgo),
    lastActivityAt: daysAgoIso(c.lastActivity),
  }
})

export const customerById = (id: string) => CUSTOMERS.find((c) => c.id === id)
