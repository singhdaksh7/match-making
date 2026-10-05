# Deletion policy (admin)

Every destructive admin action is a tenant-scoped, authenticated `DELETE` that is preceded, in the UI, by a server-computed **impact preview** (`GET /api/v1/deletion-impact/:collection/:id`) and an explicit confirmation. Code: `backend/src/deletion.ts`; UI: `src/components/ui/DeleteDialog.tsx`.

## Rules

* **Authoritative server check.** The preview and the `DELETE` use the same `computeImpact()`; the delete re-runs it inside the transaction, so a stale dialog can never delete something that became protected.
* **Tenant isolation.** Every lookup is scoped by `businessId`; nested paths also verify the parent/child relationship. Another tenant, a wrong parent or an unknown id is a plain `404`.
* **History is never silently destroyed.** Enquiries, audit log and analytics are not cascaded. (Legacy inventory-movement rows are obsolete since stock management was retired and are removed together with their variant.) A record with such history is blocked with a message (`409 HAS_DEPENDENCIES`, `details.blockers`) and, where it makes sense, the UI offers *Archive* instead.
* **No raw database errors** reach users; foreign-key failures are translated to a generic `409`.
* **Audit.** Each delete writes an `AuditLog` row (`<ENTITY>_DELETED`, entity, id, actor, name, removed counts). No secrets or PII beyond the record's display name.

## Matrix

| Entity | Class | Delete API | UI | Hard delete allowed when | Otherwise | R2 cleanup |
|---|---|---|---|---|---|---|
| Product | operational | `DELETE /products/:id` | Product detail → Delete | not referenced by an enquiry (legacy stock history no longer blocks) | blocked; **Archive** offered | yes: general images, attribute-value images, variant images |
| Variant | operational | `DELETE /products/:id/variants/:variantId` | Product detail → variant Delete | not referenced by an enquiry (legacy stock history no longer blocks) | blocked | yes: variant images |
| Product image | operational | `DELETE /products/:id/media/:mediaId` | Product edit → image trash | always (next image becomes main) | – | yes: that object |
| Attribute-value image | operational | `DELETE /products/:id/attribute-values/:valueId/images/:imageId` (existing) | Product edit → photos | always | – | yes |
| Customer | operational | `DELETE /customers/:id` | Customer detail → Delete | no catalogues and no enquiries | blocked; **Archive** offered | no |
| Catalogue | operational | `DELETE /catalogues/:id` | Catalogue list menu / detail → Delete | always (entries cascade; public link → unavailable; its enquiries are kept) | – | no |
| Catalogue entry | operational | `DELETE /catalogues/:id/items/:itemId` | Catalogue detail → ✕ on a product | not the last product of the catalogue | blocked | no |
| Category | master | `DELETE /categories/:id` | Categories → Delete | no products use it (attribute links cascade) | blocked with product count | no |
| Attribute | master | `DELETE /attributes/:id` | Attributes → Delete attribute | not used by any category, product, variant or image (values cascade) | blocked with a breakdown | no |
| Attribute value | master | `DELETE /attributes/:id/values/:valueId` | Attributes → ✕ on a value | not used by any variant/product | blocked | no |
| Collection | operational | `DELETE /collections/:id` | Collections → Delete | always (membership links cascade, products kept) | – | no |
| Enquiry | **historical** | `DELETE /enquiries/:id` | Enquiry detail → Delete | status is `CLOSED` only (items + status history cascade) | `NEW/CONTACTED/NEGOTIATING` and `CONVERTED` are blocked ("sales records") | no |
| Inventory movement | **historical** | none | none | legacy data, no longer written by the app; removed with its variant (`ON DELETE CASCADE`) | – | – |
| Audit log, analytics events | **historical** | none | none | never | – | – |
| Users / sessions | – | out of scope | – | – | – | – |

Why enquiries may be deleted when `CLOSED`: the public catalogue form is unauthenticated, so spam and test enquiries need a way out. Closing is the explicit "this is finished" step; converted enquiries are sales history and are never deletable.

## R2 / object storage strategy

R2 cannot take part in a PostgreSQL transaction, so the order is fixed:

1. Collect the object keys **from the database rows being deleted** (never from the client).
2. Delete the rows and write the audit entry in **one transaction**.
3. Only after commit, delete the objects — skipping any key that another row still references (`ProductMedia`, `VariantMedia`, `ProductAttributeValueImage`), so shared objects are never removed from under a live row.

Consequences: a database rollback can never make an object disappear; a crash or an R2 outage between steps 2 and 3 leaves at worst an **orphan object** (harmless, logged as `[storage] delete failed for key "…"` without secrets, and recorded as a `STORAGE_CLEANUP_FAILED` audit row). A database row can never point at a deleted object. The `DELETE` response contains `cleanup: { attempted, failed }`, never keys.

## Related fix

Images added while *editing* an existing product are now attached with `POST /products/:id/media` (key must be under the caller's tenant prefix); previously they were uploaded to R2 but never saved, which would also have left orphan objects.
