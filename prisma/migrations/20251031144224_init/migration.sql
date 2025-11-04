/*
  Warnings:

  - You are about to drop the `Payments` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "public"."Payments";

-- CreateTable
CREATE TABLE "public"."payments" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "USDT" TEXT NOT NULL DEFAULT 'TQx9vF3s1GJH2A7xXp6f5rN8W4tK9mE8nP3',
    "PayPal" TEXT NOT NULL DEFAULT '@TashaMendi',

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
