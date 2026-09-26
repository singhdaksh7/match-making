# Architecture

Vastraa is a React/Vite SPA served by nginx, an Express/Prisma API, and PostgreSQL. Traefik routes `/api` to the API and all other paths to the SPA on one HTTPS origin. Sessions are HttpOnly, `SameSite=Lax`, `/api` scoped, and Secure in production.

Administrative queries are tenant scoped by `businessId`. Public catalogues use cryptographically random tokens and expose only configured public fields. Local media uses tenant-prefixed filesystem object keys; image binaries are not kept in PostgreSQL or browser storage.

## Product attributes

Attribute data is hierarchical. Global `Attribute` / `AttributeValue` rows are master data only. `CategoryAttribute` assigns which attribute types a category may use. `ProductAttribute` records the types on a product. `ProductAttributeValue` records the subset of values enabled for that product. Variants may only reference enabled values; combinations are never generated unless a user explicitly asks the admin UI to generate them. Enquiry items keep SKU and attribute snapshots and are not rewritten when master data changes.

