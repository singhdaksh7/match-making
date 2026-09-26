-- Product-specific allowed attribute values.
-- Global AttributeValue rows remain master data; categories continue to
-- control which attribute types apply. This join table records the subset
-- of values enabled for each product. Existing products are backfilled from
-- values already used by their variants.

CREATE TABLE "ProductAttributeValue" (
    "productId" TEXT NOT NULL,
    "attributeValueId" TEXT NOT NULL,

    CONSTRAINT "ProductAttributeValue_pkey" PRIMARY KEY ("productId","attributeValueId")
);

CREATE INDEX "ProductAttributeValue_attributeValueId_idx" ON "ProductAttributeValue"("attributeValueId");

ALTER TABLE "ProductAttributeValue"
    ADD CONSTRAINT "ProductAttributeValue_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductAttributeValue"
    ADD CONSTRAINT "ProductAttributeValue_attributeValueId_fkey"
    FOREIGN KEY ("attributeValueId") REFERENCES "AttributeValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "ProductAttributeValue" ("productId", "attributeValueId")
SELECT DISTINCT pv."productId", vav."attributeValueId"
FROM "VariantAttributeValue" vav
INNER JOIN "ProductVariant" pv ON pv."id" = vav."variantId"
ON CONFLICT ("productId", "attributeValueId") DO NOTHING;
