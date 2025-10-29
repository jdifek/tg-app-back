/*
  Warnings:

  - You are about to drop the column `photos` on the `bundles` table. All the data in the column will be lost.
  - You are about to drop the column `videos` on the `bundles` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."bundles" DROP COLUMN "photos",
DROP COLUMN "videos";

-- CreateTable
CREATE TABLE "public"."BundleImage" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "bundleId" TEXT,

    CONSTRAINT "BundleImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BundleVideo" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "bundleId" TEXT,

    CONSTRAINT "BundleVideo_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."BundleImage" ADD CONSTRAINT "BundleImage_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "public"."bundles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BundleVideo" ADD CONSTRAINT "BundleVideo_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "public"."bundles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
