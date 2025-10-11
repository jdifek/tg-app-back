/*
  Warnings:

  - Added the required column `orderType` to the `orders` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."OrderType" AS ENUM ('PRODUCT', 'BUNDLE', 'VIP', 'CUSTOM_VIDEO', 'VIDEO_CALL', 'RATING');

-- AlterTable
ALTER TABLE "public"."orders" ADD COLUMN     "orderType" "public"."OrderType" NOT NULL;
