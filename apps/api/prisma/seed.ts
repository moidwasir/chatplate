import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Safi Restaurant database...');

  // ─── Restaurant & Branch ──────────────────────────────────────────────────
  const restaurant = await prisma.restaurant.upsert({
    where: { id: 'seed-restaurant-001' },
    update: {},
    create: {
      id: 'seed-restaurant-001',
      name: 'Safi Restaurant',
      taxPercent: 1700, // 17% sales tax (1700 paisa = 17.00%)
      currency: 'PKR',
    },
  });

  const branch = await prisma.branch.upsert({
    where: { id: 'seed-branch-001' },
    update: {},
    create: {
      id: 'seed-branch-001',
      restaurantId: restaurant.id,
      name: 'Main Branch',
      address: 'Main Boulevard, Lahore',
      phone: '+923001234567',
      lat: 31.5204,
      lng: 74.3587,
    },
  });

  // ─── Opening Hours ────────────────────────────────────────────────────────
  for (let day = 0; day <= 6; day++) {
    await prisma.openingHour.upsert({
      where: { branchId_dayOfWeek: { branchId: branch.id, dayOfWeek: day } },
      update: {},
      create: {
        branchId: branch.id,
        dayOfWeek: day,
        openTime: '11:00',
        closeTime: '23:30',
        isClosed: day === 2, // Closed on Tuesdays (example)
      },
    });
  }

  // ─── Delivery Zone ────────────────────────────────────────────────────────
  await prisma.deliveryZone.upsert({
    where: { id: 'seed-zone-001' },
    update: {},
    create: {
      id: 'seed-zone-001',
      branchId: branch.id,
      name: 'City Zone',
      polygon: {
        type: 'Polygon',
        coordinates: [[[74.30, 31.50], [74.42, 31.50], [74.42, 31.55], [74.30, 31.55], [74.30, 31.50]]],
      },
      feeType: 'FLAT',
      flatFee: 8000, // PKR 80 delivery fee
      minOrder: 50000, // PKR 500 minimum order
    },
  });

  // ─── Kitchen Station ──────────────────────────────────────────────────────
  const grill = await prisma.station.upsert({
    where: { branchId_name: { branchId: branch.id, name: 'Grill' } },
    update: {},
    create: { branchId: branch.id, name: 'Grill', color: '#EF4444' },
  });

  // ─── Menu ─────────────────────────────────────────────────────────────────
  const burgerCat = await prisma.category.upsert({
    where: { id: 'seed-cat-burgers' },
    update: {},
    create: {
      id: 'seed-cat-burgers',
      branchId: branch.id,
      name: 'Burgers',
      nameUrdu: 'برگر',
      sortOrder: 1,
    },
  });

  const drinksCat = await prisma.category.upsert({
    where: { id: 'seed-cat-drinks' },
    update: {},
    create: {
      id: 'seed-cat-drinks',
      branchId: branch.id,
      name: 'Drinks',
      nameUrdu: 'مشروبات',
      sortOrder: 2,
    },
  });

  // Classic Burger
  const classicBurger = await prisma.item.upsert({
    where: { id: 'seed-item-classic-burger' },
    update: {},
    create: {
      id: 'seed-item-classic-burger',
      categoryId: burgerCat.id,
      stationId: grill.id,
      name: 'Classic Beef Burger',
      nameUrdu: 'کلاسک بیف برگر',
      description: 'Juicy beef patty with lettuce, tomato and our signature sauce',
      price: 75000, // PKR 750
      sortOrder: 1,
    },
  });

  // Modifier group: Spice level
  const spiceGroup = await prisma.modifierGroup.upsert({
    where: { id: 'seed-mg-spice' },
    update: {},
    create: {
      id: 'seed-mg-spice',
      itemId: classicBurger.id,
      name: 'Spice Level',
      required: true,
      minChoices: 1,
      maxChoices: 1,
      sortOrder: 1,
    },
  });

  for (const [name, id] of [['Mild', 'seed-mod-mild'], ['Medium', 'seed-mod-medium'], ['Hot', 'seed-mod-hot']]) {
    await prisma.modifier.upsert({
      where: { id },
      update: {},
      create: { id, groupId: spiceGroup.id, name, priceAdjustment: 0 },
    });
  }

  // Modifier group: Add-ons
  const addonsGroup = await prisma.modifierGroup.upsert({
    where: { id: 'seed-mg-addons' },
    update: {},
    create: {
      id: 'seed-mg-addons',
      itemId: classicBurger.id,
      name: 'Add-ons',
      required: false,
      minChoices: 0,
      maxChoices: 3,
      sortOrder: 2,
    },
  });

  for (const [name, id, price] of [
    ['Extra Cheese', 'seed-mod-cheese', 5000],
    ['Bacon', 'seed-mod-bacon', 8000],
    ['Avocado', 'seed-mod-avo', 10000],
  ] as [string, string, number][]) {
    await prisma.modifier.upsert({
      where: { id },
      update: {},
      create: { id, groupId: addonsGroup.id, name, priceAdjustment: price },
    });
  }

  // Drinks
  await prisma.item.upsert({
    where: { id: 'seed-item-cola' },
    update: {},
    create: {
      id: 'seed-item-cola',
      categoryId: drinksCat.id,
      name: 'Coca-Cola 500ml',
      price: 15000, // PKR 150
      sortOrder: 1,
    },
  });

  // ─── Owner user ───────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('changeme123', 12);
  const owner = await prisma.user.upsert({
    where: { email: 'owner@safi.pk' },
    update: {},
    create: {
      email: 'owner@safi.pk',
      name: 'Safi Owner',
      role: 'OWNER',
      passwordHash,
    },
  });

  await prisma.userBranchAccess.upsert({
    where: { userId_branchId: { userId: owner.id, branchId: branch.id } },
    update: {},
    create: { userId: owner.id, branchId: branch.id },
  });

  console.log('✅ Seed complete!');
  console.log(`   Restaurant: ${restaurant.name}`);
  console.log(`   Branch: ${branch.name}`);
  console.log(`   Owner login: owner@safi.pk / changeme123`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
