-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "hasUnreadSupport" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."SupportMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "message" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "isFromAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Payments" (
    "id" TEXT NOT NULL,
    "USDT" TEXT NOT NULL DEFAULT 'TQx9vF3s1GJH2A7xXp6f5rN8W4tK9mE8nP3',
    "PayPal" TEXT NOT NULL DEFAULT '@TashaMendi',

    CONSTRAINT "Payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportMessage_userId_idx" ON "public"."SupportMessage"("userId");

-- CreateIndex
CREATE INDEX "SupportMessage_createdAt_idx" ON "public"."SupportMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."SupportMessage" ADD CONSTRAINT "SupportMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("telegramId") ON DELETE RESTRICT ON UPDATE CASCADE;
