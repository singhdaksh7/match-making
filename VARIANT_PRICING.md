# Variant pricing, explicit catalogue variants, unlimited availability

Migration `20261005120000_variant_pricing_catalogue_variants` (forward-only, data-preserving).

## Business rules

* **Unlimited availability.** There is no stock concept in the admin, the public catalogue or any API. A customer is never blocked by
  quantity. Requested quantity (`EnquiryItem.quantity`) is "pieces the customer wants", never compared with anything. Only a
  sanity cap of 1,000,000 per line keeps it inside a 32-bit column.
* **The variant is the sellable unit and its price is the only selling price.** `ProductVariant.price` (`DECIMAL(12,2)`, always > 0).
  There is no product-level selling price.
* **A catalogue shares exact variants.** `Catalogue → CatalogueItem (one per product) → CatalogueItemVariant (one per shared variant)`.
  Selecting a product never implies "all variants"; the API refuses a product without at least one variant (400).

## Pricing hierarchy (highest priority first)

1. `CatalogueItemVariant.customPrice`: an explicit price for one variant in one catalogue (the old product-level "custom price" could not
   express different variant prices, so it was redesigned per variant).
2. `ProductVariant.price × (1 + Catalogue.priceAdjustmentPct / 100)`, rounded half-up to 2 decimals.

Computed server-side with decimal.js (`backend/src/pricing.ts`): 600 + 10 % = 660.00 exactly, never `660.0000000000001`. The enquiry
snapshot stores this effective price; client-sent prices are ignored. The legacy `Product.basePrice` takes no part in any price.

## What the migration does to production data

| Change | Why / data effect |
| --- | --- |
| `Product.basePrice` becomes nullable | Kept as legacy data (not dropped: no migration risk). Never read or written. API no longer exposes it. |
| `UPDATE ProductVariant SET price = product.basePrice WHERE price <= 0 AND basePrice > 0` | One-time compatibility copy so no variant is left without a price. **No price is invented**: only an existing product price is copied, and only onto variants that had no usable price. Variants with nothing to copy are untouched. After this, the variant price is the single source of truth. |
| `CHECK (price > 0)` on `ProductVariant` | Added only if every existing row already satisfies it (guarded `DO` block), so the deploy cannot fail on legacy data. The API validates regardless. |
| `CatalogueItemVariant` table with composite FKs `(variantId, productId)` and `(catalogueItemId, productId)` | The database itself rejects a variant that belongs to a different product than its catalogue item. Tenant ownership is validated by the API on every write. |
| **Backfill of existing catalogues** | Historical meaning (old `public.ts`): a `CatalogueItem` with `variantId IS NULL` exposed **all** variants of the product; one with a `variantId` exposed only that variant. Rows are collapsed to one item per (catalogue, product) and that meaning is materialised as explicit `CatalogueItemVariant` rows, so every existing public link exposes exactly what it exposed before and none becomes empty. Catalogue tokens and enquiries are untouched. |
| `CatalogueItem.variantId` dropped; unique `(catalogueId, productId)` | Replaced by the join table (data copied above first). `CatalogueItem.customPrice` stays as an unused legacy column. |
| `InventoryMovement.variantId` FK → `ON DELETE CASCADE` | Stock history is obsolete legacy data (table and rows are preserved) and no longer blocks deleting a product/variant. Enquiry history still does. |
| `ProductVariant.stock/reserved/lowStockThreshold`, `Catalogue.showExactStock/showAvailability` | Left in place as legacy columns; no code reads or writes them. |
| `EnquiryItem.productNameSnapshot`, `imageSnapshot` | New nullable snapshot columns; existing rows get the product name copied. |

## Public storefront

* `GET /api/v1/public/catalogues/:token` returns, per product, only the selected, ACTIVE variants (`price`, `attributes`, `images`) plus
  a `priceRange`. Products with nothing sellable are omitted. No stock/availability fields.
* The product page builds one selector per attribute from the shared variants only, shows the exact variant price (or the range of the
  variants still matching the current picks), and lists the shared variants as tappable chips. A combination that is not shared cannot
  form: picking a value that conflicts with an earlier pick releases the oldest conflicting pick.

## Image priority (public gallery, cart lines, enquiry image snapshot)

1. the exactly selected variant's own `VariantMedia` (supported by the data model and API; there is no admin upload UI for it yet)
2. photos of the most recently chosen image-capable (`Attribute.supportsImages`) value, e.g. Color → Blue (`ProductAttributeValueImage`)
3. the product's general `ProductMedia`

Changing a non-image attribute (Size) never changes the gallery. Implemented in `src/utils/gallery.ts` (unit-tested) and mirrored in
`variantImageKey` (`backend/src/public.ts`) for the enquiry snapshot.
