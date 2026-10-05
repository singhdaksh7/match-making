-- Variant-level pricing, explicit per-catalogue variant selection, and retirement of stock management.
-- Forward-only and data-preserving: no table is dropped and no stock/inventory data is deleted.

-- 1. Product-level price is retired. The column stays (nullable) as legacy data; nothing reads or writes it any more.
ALTER TABLE "Product" ALTER COLUMN "basePrice" DROP NOT NULL;

-- 2. ProductVariant.price is the source of truth. Any variant without a usable price inherits the legacy product price
--    once (an explicit, documented compatibility copy; no price is invented). Variants with no legacy price are left untouched.
UPDATE "ProductVariant" v
SET "price" = p."basePrice"
FROM "Product" p
WHERE v."productId" = p."id" AND v."price" <= 0 AND p."basePrice" IS NOT NULL AND p."basePrice" > 0;

-- Enforce "price > 0" in the database too, but only when every existing row already satisfies it, so deploying can never fail on legacy data.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "ProductVariant" WHERE "price" <= 0) THEN
    ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_price_positive" CHECK ("price" > 0);
  END IF;
END $$;

-- 3. Composite uniqueness targets so the join table can guarantee the variant belongs to the catalogue item's product.
CREATE UNIQUE INDEX "ProductVariant_id_productId_key" ON "ProductVariant"("id", "productId");
CREATE UNIQUE INDEX "CatalogueItem_id_productId_key" ON "CatalogueItem"("id", "productId");

-- 4. The persisted catalogue -> product -> selected variants relation.
CREATE TABLE "CatalogueItemVariant" (
    "catalogueItemId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customPrice" DECIMAL(12,2),
    CONSTRAINT "CatalogueItemVariant_pkey" PRIMARY KEY ("catalogueItemId", "variantId")
);
CREATE INDEX "CatalogueItemVariant_variantId_idx" ON "CatalogueItemVariant"("variantId");
ALTER TABLE "CatalogueItemVariant" ADD CONSTRAINT "CatalogueItemVariant_catalogueItemId_productId_fkey"
    FOREIGN KEY ("catalogueItemId", "productId") REFERENCES "CatalogueItem"("id", "productId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CatalogueItemVariant" ADD CONSTRAINT "CatalogueItemVariant_variantId_productId_fkey"
    FOREIGN KEY ("variantId", "productId") REFERENCES "ProductVariant"("id", "productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Backfill so existing public catalogue links keep exposing exactly what they exposed before.
--    Historical meaning (see backend/src/public.ts before this change): a CatalogueItem with variantId NULL exposed ALL variants of
--    the product; a CatalogueItem with a variantId exposed only that variant (one row per variant). Rows are collapsed to one
--    CatalogueItem per (catalogue, product) and the legacy meaning is materialised as explicit CatalogueItemVariant rows.
CREATE TEMP TABLE "_catalogue_item_canon" AS
SELECT "catalogueId", "productId", MIN("id") AS "keepId", BOOL_OR("variantId" IS NULL) AS "allVariants"
FROM "CatalogueItem"
GROUP BY "catalogueId", "productId";

INSERT INTO "CatalogueItemVariant" ("catalogueItemId", "variantId", "productId", "customPrice")
SELECT c."keepId", v."id", v."productId",
       (SELECT ci."customPrice" FROM "CatalogueItem" ci WHERE ci."catalogueId" = c."catalogueId" AND ci."productId" = c."productId" AND ci."variantId" IS NULL LIMIT 1)
FROM "_catalogue_item_canon" c
JOIN "ProductVariant" v ON v."productId" = c."productId"
WHERE c."allVariants";

INSERT INTO "CatalogueItemVariant" ("catalogueItemId", "variantId", "productId", "customPrice")
SELECT c."keepId", ci."variantId", ci."productId", ci."customPrice"
FROM "CatalogueItem" ci
JOIN "_catalogue_item_canon" c ON c."catalogueId" = ci."catalogueId" AND c."productId" = ci."productId"
WHERE NOT c."allVariants" AND ci."variantId" IS NOT NULL
ON CONFLICT DO NOTHING;

DELETE FROM "CatalogueItem" WHERE "id" NOT IN (SELECT "keepId" FROM "_catalogue_item_canon");
DROP TABLE "_catalogue_item_canon";

-- 6. A catalogue item is now one row per product; the variant choice lives in CatalogueItemVariant.
DROP INDEX "CatalogueItem_catalogueId_productId_variantId_key";
ALTER TABLE "CatalogueItem" DROP CONSTRAINT "CatalogueItem_variantId_fkey";
ALTER TABLE "CatalogueItem" DROP COLUMN "variantId";
CREATE UNIQUE INDEX "CatalogueItem_catalogueId_productId_key" ON "CatalogueItem"("catalogueId", "productId");

-- 7. Stock management is retired: historical movement rows are legacy data and no longer protect a variant from being deleted.
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_variantId_fkey";
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. Enquiry line snapshots: product name and primary image at the time of the enquiry.
ALTER TABLE "EnquiryItem" ADD COLUMN "productNameSnapshot" TEXT, ADD COLUMN "imageSnapshot" TEXT;
UPDATE "EnquiryItem" e SET "productNameSnapshot" = p."name"
FROM "Product" p WHERE e."productId" = p."id" AND e."productNameSnapshot" IS NULL;
