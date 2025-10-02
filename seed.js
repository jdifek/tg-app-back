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
        image: 'https://via.placeholder.com/300x200',
        categoryId: category2.id
      },
      {
        name: 'Signed Print',
        description: 'Autographed physical print',
        price: 49.99,
        image: 'https://via.placeholder.com/300x200',
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
        image: 'https://via.placeholder.com/300x200',
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
        image: 'https://via.placeholder.com/300x200',
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
        image: 'https://via.placeholder.com/300x200'
      },
      {
        name: 'Professional Camera',
        description: 'For better content creation',
        price: 1299.99,
        image: 'https://via.placeholder.com/300x200'
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