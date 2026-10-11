import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const africanCountries: Prisma.CountryCreateManyInput[] = [
  { name: 'Algeria', code: 'DZ', flag: '🇩🇿', region: 'NORTH_AFRICA', cuisineDescription: 'Couscous, tagines, and warm Mediterranean flavors.' },
  { name: 'Angola', code: 'AO', flag: '🇦🇴', region: 'SOUTHERN_AFRICA', cuisineDescription: 'Hearty stews and cassava-based dishes.' },
  { name: 'Benin', code: 'BJ', flag: '🇧🇯', region: 'WEST_AFRICA', cuisineDescription: 'Palm oil sauces and yams.' },
  { name: 'Botswana', code: 'BW', flag: '🇧🇼', region: 'SOUTHERN_AFRICA', cuisineDescription: 'Traditional millet and grilled meats.' },
  { name: 'Burkina Faso', code: 'BF', flag: '🇧🇫', region: 'WEST_AFRICA', cuisineDescription: 'Rice, grilled meats, and sauces.' },
  { name: 'Burundi', code: 'BI', flag: '🇧🇮', region: 'EAST_AFRICA', cuisineDescription: 'Banana and bean-based comfort foods.' },
  { name: 'Cabo Verde', code: 'CV', flag: '🇨🇻', region: 'WEST_AFRICA', cuisineDescription: 'Seafood and island flavors.' },
  { name: 'Cameroon', code: 'CM', flag: '🇨🇲', region: 'CENTRAL_AFRICA', cuisineDescription: 'Eru, ndolé, and rich local sauces.' },
  { name: 'Central African Republic', code: 'CF', flag: '🇨🇫', region: 'CENTRAL_AFRICA', cuisineDescription: 'Root vegetables and home-style stews.' },
  { name: 'Chad', code: 'TD', flag: '🇹🇩', region: 'CENTRAL_AFRICA', cuisineDescription: 'Spicy stews and millet dishes.' },
  { name: 'Comoros', code: 'KM', flag: '🇰🇲', region: 'EAST_AFRICA', cuisineDescription: 'Coconut rice and seafood.' },
  { name: 'Congo', code: 'CG', flag: '🇨🇬', region: 'CENTRAL_AFRICA', cuisineDescription: 'Plantains, cassava, and aromatic stews.' },
  { name: "Côte d’Ivoire", code: 'CI', flag: '🇨🇮', region: 'WEST_AFRICA', cuisineDescription: 'Attiéké, soups, and grilled fish.' },
  { name: 'Democratic Republic of the Congo', code: 'CD', flag: '🇨🇩', region: 'CENTRAL_AFRICA', cuisineDescription: 'Cassava and leafy greens.' },
  { name: 'Djibouti', code: 'DJ', flag: '🇩🇯', region: 'EAST_AFRICA', cuisineDescription: 'Spiced rice and coastal dishes.' },
  { name: 'Egypt', code: 'EG', flag: '🇪🇬', region: 'NORTH_AFRICA', cuisineDescription: 'Koshari, ful medames, and rice dishes.' },
  { name: 'Equatorial Guinea', code: 'GQ', flag: '🇬🇶', region: 'CENTRAL_AFRICA', cuisineDescription: 'Seafood and regional stews.' },
  { name: 'Eritrea', code: 'ER', flag: '🇪🇷', region: 'EAST_AFRICA', cuisineDescription: 'Flatbread and spiced lentils.' },
  { name: 'Eswatini', code: 'SZ', flag: '🇸🇿', region: 'SOUTHERN_AFRICA', cuisineDescription: 'Maize and simple home dishes.' },
  { name: 'Ethiopia', code: 'ET', flag: '🇪🇹', region: 'EAST_AFRICA', cuisineDescription: 'Injera, doro wat, and lentils.' },
  { name: 'Gabon', code: 'GA', flag: '🇬🇦', region: 'CENTRAL_AFRICA', cuisineDescription: 'Seafood and rich stews.' },
  { name: 'Gambia', code: 'GM', flag: '🇬🇲', region: 'WEST_AFRICA', cuisineDescription: 'Groundnut stew and rice.' },
  { name: 'Ghana', code: 'GH', flag: '🇬🇭', region: 'WEST_AFRICA', cuisineDescription: 'Jollof, waakye, and grilled flavors.' },
  { name: 'Guinea', code: 'GN', flag: '🇬🇳', region: 'WEST_AFRICA', cuisineDescription: 'Rice dishes and savory sauces.' },
  { name: 'Guinea-Bissau', code: 'GW', flag: '🇬🇼', region: 'WEST_AFRICA', cuisineDescription: 'Seafood and cassava-based foods.' },
  { name: 'Kenya', code: 'KE', flag: '🇰🇪', region: 'EAST_AFRICA', cuisineDescription: 'Nyama choma, ugali, and chapati.' },
  { name: 'Lesotho', code: 'LS', flag: '🇱🇸', region: 'SOUTHERN_AFRICA', cuisineDescription: 'Maize, bean dishes, and hearty meals.' },
  { name: 'Liberia', code: 'LR', flag: '🇱🇷', region: 'WEST_AFRICA', cuisineDescription: 'Rice and greens dishes.' },
  { name: 'Libya', code: 'LY', flag: '🇱🇾', region: 'NORTH_AFRICA', cuisineDescription: 'Couscous and spiced lamb dishes.' },
  { name: 'Madagascar', code: 'MG', flag: '🇲🇬', region: 'SOUTHERN_AFRICA', cuisineDescription: 'Rice, zebu, and coconut dishes.' },
  { name: 'Malawi', code: 'MW', flag: '🇲🇼', region: 'SOUTHERN_AFRICA', cuisineDescription: 'Nshima and vegetable dishes.' },
  { name: 'Mali', code: 'ML', flag: '🇲🇱', region: 'WEST_AFRICA', cuisineDescription: 'Rice and grilled dishes with punchy sauces.' },
  { name: 'Mauritania', code: 'MR', flag: '🇲🇷', region: 'NORTH_AFRICA', cuisineDescription: 'Rice, stews, and coastal flavors.' },
  { name: 'Mauritius', code: 'MU', flag: '🇲🇺', region: 'EAST_AFRICA', cuisineDescription: 'Curry, seafood, and island fusion.' },
  { name: 'Morocco', code: 'MA', flag: '🇲🇦', region: 'NORTH_AFRICA', cuisineDescription: 'Tagines, couscous, and aromatic herbs.' },
  { name: 'Mozambique', code: 'MZ', flag: '🇲🇿', region: 'SOUTHERN_AFRICA', cuisineDescription: 'Piri-piri chicken and rice.' },
  { name: 'Namibia', code: 'NA', flag: '🇳🇦', region: 'SOUTHERN_AFRICA', cuisineDescription: 'Game meats and savory stews.' },
  { name: 'Niger', code: 'NE', flag: '🇳🇪', region: 'WEST_AFRICA', cuisineDescription: 'Millet and grilled specialties.' },
  { name: 'Nigeria', code: 'NG', flag: '🇳🇬', region: 'WEST_AFRICA', cuisineDescription: 'Jollof rice, soups, and rich stews.' },
  { name: 'Rwanda', code: 'RW', flag: '🇷🇼', region: 'EAST_AFRICA', cuisineDescription: 'Bananas, beans, and comforting stew dishes.' },
  { name: 'São Tomé and Príncipe', code: 'ST', flag: '🇸🇹', region: 'CENTRAL_AFRICA', cuisineDescription: 'Seafood and tropical flavors.' },
  { name: 'Senegal', code: 'SN', flag: '🇸🇳', region: 'WEST_AFRICA', cuisineDescription: 'Thieboudienne and rich coastal dishes.' },
  { name: 'Seychelles', code: 'SC', flag: '🇸🇨', region: 'EAST_AFRICA', cuisineDescription: 'Coconut curries and seafood.' },
  { name: 'Sierra Leone', code: 'SL', flag: '🇸🇱', region: 'WEST_AFRICA', cuisineDescription: 'Rice and stew traditions.' },
  { name: 'Somalia', code: 'SO', flag: '🇸🇴', region: 'EAST_AFRICA', cuisineDescription: 'Rice goods and aromatic spice dishes.' },
  { name: 'South Africa', code: 'ZA', flag: '🇿🇦', region: 'SOUTHERN_AFRICA', cuisineDescription: 'Braaied meats and vibrant regional foods.' },
  { name: 'South Sudan', code: 'SS', flag: '🇸🇸', region: 'EAST_AFRICA', cuisineDescription: 'Stews and nourishing grains.' },
  { name: 'Sudan', code: 'SD', flag: '🇸🇩', region: 'NORTH_AFRICA', cuisineDescription: 'Ful, stews, and spiced rice.' },
  { name: 'Tanzania', code: 'TZ', flag: '🇹🇿', region: 'EAST_AFRICA', cuisineDescription: 'Pilau, coconut-rich dishes, and seafood.' },
  { name: 'Togo', code: 'TG', flag: '🇹🇬', region: 'WEST_AFRICA', cuisineDescription: 'Sauces and communal rice dishes.' },
  { name: 'Tunisia', code: 'TN', flag: '🇹🇳', region: 'NORTH_AFRICA', cuisineDescription: 'Couscous and herb-forward meals.' },
  { name: 'Uganda', code: 'UG', flag: '🇺🇬', region: 'EAST_AFRICA', cuisineDescription: 'Matoke and stew traditions.' },
  { name: 'Zambia', code: 'ZM', flag: '🇿🇲', region: 'SOUTHERN_AFRICA', cuisineDescription: 'Nshima and simple seasonal foods.' },
  { name: 'Zimbabwe', code: 'ZW', flag: '🇿🇼', region: 'SOUTHERN_AFRICA', cuisineDescription: 'Sadza and shared family meals.' },
];

const sampleDishes = [
  { name: 'Jollof Rice', slug: 'jollof-rice', description: 'Tomato-rich rice with pepper, onion, and grilled protein.', category: 'Rice' },
  { name: 'Eru', slug: 'eru', description: 'Leafy soup prepared with waterleaf and served with garri or plantain.', category: 'Soup' },
  { name: 'Couscous', slug: 'couscous', description: 'Steamed semolina served with vegetables and savory stew.', category: 'Stew' },
  { name: 'Injera & Doro Wat', slug: 'injera-doro-wat', description: 'Fermented bread with spicy chicken stew and onions.', category: 'Family Meal' },
  { name: 'Thieboudienne', slug: 'thieboudienne', description: 'Traditional rice dish with fish, vegetables, and spices.', category: 'Rice' },
  { name: 'Ndolé', slug: 'ndole', description: 'Cameroonian specialty with bitter leaves and ground nuts.', category: 'Soup' },
];

const marylandDemoChefs = [
  { email: 'demo.chef01@afrochop.local', name: 'Amara Demo Kitchen', city: 'Baltimore', cuisine: 'Nigeria', dishSlug: 'jollof-rice', price: 16 },
  { email: 'demo.chef02@afrochop.local', name: 'Kwame Demo Kitchen', city: 'Silver Spring', cuisine: 'Ghana', dishSlug: 'jollof-rice', price: 18 },
  { email: 'demo.chef03@afrochop.local', name: 'Mireille Demo Kitchen', city: 'Rockville', cuisine: 'Cameroon', dishSlug: 'ndole', price: 19 },
  { email: 'demo.chef04@afrochop.local', name: 'Amina Demo Kitchen', city: 'Gaithersburg', cuisine: 'Morocco', dishSlug: 'couscous', price: 17 },
  { email: 'demo.chef05@afrochop.local', name: 'Selam Demo Kitchen', city: 'Bowie', cuisine: 'Ethiopia', dishSlug: 'injera-doro-wat', price: 20 },
  { email: 'demo.chef06@afrochop.local', name: 'Fatou Demo Kitchen', city: 'College Park', cuisine: 'Senegal', dishSlug: 'thieboudienne', price: 21 },
  { email: 'demo.chef07@afrochop.local', name: 'Chinwe Demo Kitchen', city: 'Hyattsville', cuisine: 'Nigeria', dishSlug: 'jollof-rice', price: 15 },
  { email: 'demo.chef08@afrochop.local', name: 'Nia Demo Kitchen', city: 'Annapolis', cuisine: 'Ghana', dishSlug: 'jollof-rice', price: 18 },
  { email: 'demo.chef09@afrochop.local', name: 'Ngozi Demo Kitchen', city: 'Frederick', cuisine: 'Cameroon', dishSlug: 'eru', price: 19 },
  { email: 'demo.chef10@afrochop.local', name: 'Yasmine Demo Kitchen', city: 'Laurel', cuisine: 'Morocco', dishSlug: 'couscous', price: 17 },
];

async function seedUsers() {
  const passwordHash = await bcrypt.hash('Password123!', 10);

  await prisma.user.upsert({
    where: { email: 'admin@afrochop.local' },
    update: {},
    create: {
      email: 'admin@afrochop.local',
      name: 'System Admin',
      passwordHash,
      role: UserRole.admin,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'customer@afrochop.local' },
    update: {},
    create: {
      email: 'customer@afrochop.local',
      name: 'Sample Customer',
      passwordHash,
      role: UserRole.customer,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'chef@afrochop.local' },
    update: {},
    create: {
      email: 'chef@afrochop.local',
      name: 'Sample Chef',
      passwordHash,
      role: UserRole.chef,
      isActive: true,
    },
  });
}

async function seedCountries() {
  await prisma.country.createMany({
    data: africanCountries,
    skipDuplicates: true,
  });
}

async function seedDishes() {
  await prisma.dish.createMany({
    data: sampleDishes.map((dish) => ({
      name: dish.name,
      slug: dish.slug,
      description: dish.description,
      category: dish.category,
      isApproved: true,
    })),
    skipDuplicates: true,
  });

}

async function seedDishCountries() {
  const dishCountryCodes: Record<string, string[]> = {
    'jollof-rice': ['NG', 'GH'],
    eru: ['CM'],
    couscous: ['MA', 'DZ', 'TN'],
    'injera-doro-wat': ['ET'],
    thieboudienne: ['SN'],
    ndole: ['CM'],
  };

  for (const [slug, countryCodes] of Object.entries(dishCountryCodes)) {
    const dish = await prisma.dish.findUnique({ where: { slug }, select: { id: true } });
    if (!dish) continue;
    const countries = await prisma.country.findMany({
      where: { code: { in: countryCodes } },
      select: { id: true },
    });
    if (countries.length > 0) {
      await prisma.dishCountry.createMany({
        data: countries.map((country) => ({ dishId: dish.id, countryId: country.id })),
        skipDuplicates: true,
      });
    }
  }
}

async function seedSampleChef() {
  const user = await prisma.user.findUnique({
    where: { email: 'chef@afrochop.local' },
    select: { id: true },
  });
  if (!user) return;

  const chef = await prisma.chefProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      displayName: 'Sample Chef',
      bio: 'A development sample profile for exploring AfroChop. Profile content is for local testing only.',
      city: 'Brooklyn',
      state: 'NY',
      countryCode: 'US',
      specialties: ['Nigerian home cooking'],
      languages: ['English'],
      serviceTypes: ['prepared_meals', 'bulk_meal_prep', 'in_home_cooking'],
      verificationStatus: 'approved',
      isPublic: true,
      serviceRadiusKm: 25,
    },
    update: {},
  });

  const jollof = await prisma.dish.findUnique({
    where: { slug: 'jollof-rice' },
    select: { id: true },
  });
  if (jollof) {
    await prisma.chefDish.upsert({
      where: { chefId_dishId: { chefId: chef.id, dishId: jollof.id } },
      create: {
        chefId: chef.id,
        dishId: jollof.id,
        price: 18,
        portionSize: 'Serves 2',
        leadTimeHours: 24,
        description: 'A sample listing for local testing.',
      },
      update: {},
    });
  }

  const existingArea = await prisma.chefServiceArea.findFirst({
    where: { chefId: chef.id, city: 'Brooklyn', state: 'NY', countryCode: 'US' },
    select: { id: true },
  });
  if (!existingArea) {
    await prisma.chefServiceArea.create({
      data: {
        chefId: chef.id,
        city: 'Brooklyn',
        state: 'NY',
        countryCode: 'US',
        radiusKm: 25,
        offersDelivery: false,
        offersPickup: true,
      },
    });
  }
}

async function seedMarylandDemoChefs() {
  const passwordHash = await bcrypt.hash('Password123!', 10);

  for (const demoChef of marylandDemoChefs) {
    const user = await prisma.user.upsert({
      where: { email: demoChef.email },
      update: {},
      create: {
        email: demoChef.email,
        name: demoChef.name,
        passwordHash,
        role: UserRole.chef,
        isActive: true,
      },
      select: { id: true },
    });

    const chef = await prisma.chefProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        displayName: demoChef.name,
        bio: `Fictional local test profile for ${demoChef.cuisine} cuisine. Not a real cook and not available for orders.`,
        city: demoChef.city,
        state: 'MD',
        countryCode: 'US',
        specialties: [demoChef.cuisine],
        languages: ['English'],
        serviceTypes: ['prepared_meals'],
        verificationStatus: 'approved',
        isPublic: true,
        serviceRadiusKm: 25,
      },
      update: {
        displayName: demoChef.name,
        bio: `Fictional local test profile for ${demoChef.cuisine} cuisine. Not a real cook and not available for orders.`,
        city: demoChef.city,
        state: 'MD',
        countryCode: 'US',
        specialties: [demoChef.cuisine],
        serviceTypes: ['prepared_meals'],
        verificationStatus: 'approved',
        isPublic: true,
        serviceRadiusKm: 25,
      },
    });

    const dish = await prisma.dish.findUnique({
      where: { slug: demoChef.dishSlug },
      select: { id: true },
    });
    if (dish) {
      await prisma.chefDish.upsert({
        where: { chefId_dishId: { chefId: chef.id, dishId: dish.id } },
        create: {
          chefId: chef.id,
          dishId: dish.id,
          price: demoChef.price,
          portionSize: 'Serves 2',
          leadTimeHours: 24,
          description: 'Fictional menu listing for local app testing only.',
        },
        update: {
          price: demoChef.price,
          portionSize: 'Serves 2',
          description: 'Fictional menu listing for local app testing only.',
        },
      });
    }

    const existingArea = await prisma.chefServiceArea.findFirst({
      where: { chefId: chef.id, city: demoChef.city, state: 'MD', countryCode: 'US' },
      select: { id: true },
    });
    if (!existingArea) {
      await prisma.chefServiceArea.create({
        data: {
          chefId: chef.id,
          city: demoChef.city,
          state: 'MD',
          countryCode: 'US',
          radiusKm: 25,
          offersDelivery: true,
          offersPickup: true,
        },
      });
    }
  }
}

const devComplianceServiceTypes = ['prepared_meals', 'bulk_meal_prep'] as const;
const devComplianceJurisdictions = ['NY', 'MD'];

// Local-only fixtures so quote requests can be tested end to end. These are not
// legal guidance and must never be seeded into a real environment.
async function seedDevComplianceFixtures() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed development compliance fixtures in production.');
  }
  const now = new Date();
  const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  for (const jurisdictionCode of devComplianceJurisdictions) {
    for (const serviceType of devComplianceServiceTypes) {
      const rule = {
        requiresApprovedProvider: true,
        requiresServiceApproval: true,
        requiresIdentityVerification: true,
        requiresCustomerIdentityVerification: false,
        requiresFoodSafetyCredential: false,
        requiresBackgroundScreening: false,
        requiredPermitTypes: [] as string[],
        isActive: true,
        sourceReference: 'LOCAL DEV FIXTURE - not legal or regulatory guidance',
      };
      await prisma.complianceRule.upsert({
        where: { jurisdictionCode_serviceType: { jurisdictionCode, serviceType } },
        create: { jurisdictionCode, serviceType, ...rule },
        update: rule,
      });
    }
  }

  const customer = await prisma.user.findUnique({
    where: { email: 'customer@afrochop.local' },
    select: { id: true },
  });
  const chefUser = await prisma.user.findUnique({
    where: { email: 'chef@afrochop.local' },
    select: { id: true, chefProfile: { select: { id: true } } },
  });
  if (!customer || !chefUser?.chefProfile) return;
  const chefId = chefUser.chefProfile.id;

  const verified = { status: 'verified' as const, verifiedAt: now, reviewedAt: now, expiresAt: oneYearFromNow };
  for (const type of ['email', 'phone'] as const) {
    await prisma.userVerification.upsert({
      where: { userId_type: { userId: customer.id, type } },
      create: { userId: customer.id, type, ...verified },
      update: verified,
    });
  }
  await prisma.userVerification.upsert({
    where: { userId_type: { userId: chefUser.id, type: 'identity' } },
    create: { userId: chefUser.id, type: 'identity', ...verified },
    update: verified,
  });

  for (const serviceType of devComplianceServiceTypes) {
    await prisma.chefServiceApproval.upsert({
      where: { chefId_serviceType_jurisdictionCode: { chefId, serviceType, jurisdictionCode: 'NY' } },
      create: { chefId, serviceType, jurisdictionCode: 'NY', status: 'verified', reviewedAt: now },
      update: { status: 'verified', reviewedAt: now },
    });
  }

  await prisma.stripeConnectedAccount.upsert({
    where: { chefId },
    create: {
      chefId,
      stripeAccountId: 'acct_local_dev_fixture',
      countryCode: 'US',
      status: 'eligible',
      payoutsEnabled: true,
      detailsSubmitted: true,
      onboardingCompletedAt: now,
    },
    update: { status: 'eligible', payoutsEnabled: true, detailsSubmitted: true },
  });
}

const demoFarmers = [
  {
    email: 'demo.farmer01@afrochop.local',
    name: 'Kofi Demo Farm',
    city: 'Upper Marlboro',
    produce: [
      { name: 'Fresh Corn', category: 'vegetable', price: 0.75, unit: 'ear' },
      { name: 'Okra', category: 'vegetable', price: 4.5, unit: 'lb' },
      { name: 'Garden Eggs (African Eggplant)', category: 'vegetable', price: 5, unit: 'lb' },
    ],
  },
  {
    email: 'demo.farmer02@afrochop.local',
    name: 'Adaeze Demo Gardens',
    city: 'Frederick',
    produce: [
      { name: 'Ugu (Fluted Pumpkin Leaves)', category: 'vegetable', price: 3, unit: 'bunch' },
      { name: 'Scotch Bonnet Peppers', category: 'vegetable', price: 6, unit: 'lb' },
      { name: 'Cassava', category: 'tuber', price: 2.5, unit: 'lb' },
    ],
  },
  {
    email: 'demo.farmer03@afrochop.local',
    name: 'Mamadou Demo Acres',
    city: 'Silver Spring',
    produce: [
      { name: 'Collard Greens', category: 'vegetable', price: 2.5, unit: 'bunch' },
      { name: 'Sweet Potatoes', category: 'tuber', price: 1.8, unit: 'lb' },
      { name: 'Fresh Okra', category: 'vegetable', price: 4, unit: 'lb' },
    ],
  },
];

async function seedDemoFarmers() {
  const passwordHash = await bcrypt.hash('Password123!', 10);
  for (const demo of demoFarmers) {
    const user = await prisma.user.upsert({
      where: { email: demo.email },
      update: {},
      create: { email: demo.email, name: demo.name, passwordHash, role: UserRole.farmer, isActive: true },
      select: { id: true },
    });
    const farmer = await prisma.farmerProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        farmName: demo.name,
        bio: 'Fictional local test farm. Not a real farmer.',
        city: demo.city,
        state: 'MD',
        countryCode: 'US',
        offersPickup: true,
        offersDelivery: true,
      },
      select: { id: true },
    });
    if ((await prisma.farmProduce.count({ where: { farmerId: farmer.id } })) === 0) {
      await prisma.farmProduce.createMany({
        data: demo.produce.map((item) => ({ ...item, farmerId: farmer.id })),
      });
    }
  }
}

async function main() {
  await seedUsers();
  await seedCountries();
  await seedDishes();
  await seedDishCountries();
  await seedSampleChef();
  await seedMarylandDemoChefs();
  await seedDemoFarmers();
  await seedDevComplianceFixtures();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
