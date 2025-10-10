/*
  Warnings:

  - You are about to drop the column `content` on the `bundles` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."bundles" DROP COLUMN "content",
ADD COLUMN     "exclusive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "photos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "videos" INTEGER NOT NULL DEFAULT 0;
