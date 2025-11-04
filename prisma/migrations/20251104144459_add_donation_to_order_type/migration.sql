-- AlterEnum
ALTER TYPE "public"."OrderType" ADD VALUE 'DONATION';

-- AlterTable
ALTER TABLE "public"."orders" ADD COLUMN     "donationMessage" TEXT;
