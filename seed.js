const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Создаем категории
  const category1 = await prisma.category.create({
    data: {
      name: 'Physical Products',
      description: 'Physical items that need shipping'
    }
  });

  const category2 = await prisma.category.create({
    data: {
      name: 'Digital Products',
      description: 'Digital content and downloads'
    }
  });

  // Создаем примеры продуктов
  await prisma.product.createMany({
    data: [
      {
        name: 'Premium Photo Set',
        description: 'Exclusive photo collection',
        price: 29.99,
        image: 'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e', // Стоковое фото
        categoryId: category2.id
      },
      {
        name: 'Signed Print',
        description: 'Autographed physical print',
        price: 49.99,
        image: 'https://images.unsplash.com/photo-1523206489230-c012c64b2b48', // Фото принта
        categoryId: category1.id
      }
    ]
  });

  // Создаем примеры бандлов
  await prisma.bundle.createMany({
    data: [
      {
        name: 'Ultimate Collection',
        description: 'Complete content bundle with exclusive materials',
        price: 99.99,
        image: 'https://images.unsplash.com/photo-1549921296-3a6b7a249e08', // Контент-бандл
        content: JSON.stringify({
          photos: 50,
          videos: 10,
          exclusive: true
        })
      },
      {
        name: 'Starter Pack',
        description: 'Perfect for newcomers',
        price: 19.99,
        image: 'https://images.unsplash.com/photo-1506806732259-39c2d0268443', // Начальный пакет
        content: JSON.stringify({
          photos: 15,
          videos: 3,
          exclusive: false
        })
      }
    ]
  });

  // Создаем примеры wishlist items
  await prisma.wishlistItem.createMany({
    data: [
      {
        name: 'Designer Handbag',
        description: 'Luxury designer handbag from my wishlist',
        price: 299.99,
        image: 'https://images.unsplash.com/photo-1600185365314-dbc4f3f2b7c0' // Сумка
      },
      {
        name: 'Professional Camera',
        description: 'For better content creation',
        price: 1299.99,
        image: 'https://images.unsplash.com/photo-1519183071298-a2962be90b8e' // Камера
      }
    ]
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
