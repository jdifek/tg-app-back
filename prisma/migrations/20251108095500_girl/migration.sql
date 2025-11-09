-- CreateTable
CREATE TABLE "public"."Girl" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "banner" TEXT NOT NULL DEFAULT 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=1200',
    "logo" TEXT NOT NULL DEFAULT 'https://img.freepik.com/free-photo/attractive-positive-elegant-young-woman-cafe_23-2148071691.jpg?semt=ais_hybrid&w=740&q=80',
    "tgLink" TEXT NOT NULL DEFAULT '@wuzimu6',

    CONSTRAINT "Girl_pkey" PRIMARY KEY ("id")
);
