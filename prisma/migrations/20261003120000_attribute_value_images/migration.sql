-- Attribute-value-specific product images.
-- Forward-only: adds Attribute.supportsImages (default false), ProductMedia.sizeBytes
-- (nullable so existing rows are preserved) and ProductAttributeValueImage.
-- Images hang off the composite (productId, attributeValueId) of ProductAttributeValue
-- and cascade only from that row (never from the global AttributeValue).
-- Only the stable storage key is stored; public URLs are derived at response time.

ALTER TABLE "Attribute" ADD COLUMN "supportsImages" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ProductMedia" ADD COLUMN "sizeBytes" INTEGER;

CREATE TABLE "ProductAttributeValueImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "attributeValueId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAttributeValueImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductAttributeValueImage_productId_attributeValueId_sortO_idx"
    ON "ProductAttributeValueImage"("productId", "attributeValueId", "sortOrder");

ALTER TABLE "ProductAttributeValueImage"
    ADD CONSTRAINT "ProductAttributeValueImage_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductAttributeValueImage"
    ADD CONSTRAINT "ProductAttributeValueImage_productId_attributeValueId_fkey"
    FOREIGN KEY ("productId", "attributeValueId") REFERENCES "ProductAttributeValue"("productId", "attributeValueId") ON DELETE CASCADE ON UPDATE CASCADE;
