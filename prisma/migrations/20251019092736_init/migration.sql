-- CreateEnum
CREATE TYPE "public"."PaymentMethod" AS ENUM ('CARD_CRYPTO', 'USDT_TRC20', 'PAYPAL', 'STARS', 'MANUAL');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'AWAITING_CHECK', 'CONFIRMED', 'FAILED');

-- AlterTable
ALTER TABLE "public"."orders" ADD COLUMN     "paymentMethod" "public"."PaymentMethod" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "paymentStatus" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING';
