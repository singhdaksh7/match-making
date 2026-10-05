import type {
  Attribute, AppSettings, Catalogue, Category, Customer,
  Collection, CustomerActivity, Enquiry, Notification, Product, ProductVariant,
} from '@/types'

/** Everything the admin and public screens keep in memory; always loaded from the API. */
export interface AppData {
  products: Product[]
  variants: ProductVariant[]
  categories: Category[]
  attributes: Attribute[]
  customers: Customer[]
  collections: Collection[]
  customerActivities: CustomerActivity[]
  catalogues: Catalogue[]
  enquiries: Enquiry[]
  notifications: Notification[]
  settings: AppSettings
}
