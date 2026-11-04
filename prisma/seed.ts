import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { permissionsForRoles } from '../src/shared/authorization/permissions.js';

const prisma = new PrismaClient();

export const DEMO_BUSINESS_ID = '11111111-1111-4111-8111-111111111111';
export const NORTE_BUSINESS_ID = '22222222-2222-4222-8222-222222222222';

const CUST = {
  juan: '33333333-3333-4333-8333-000000000001',
  abc: '33333333-3333-4333-8333-000000000002',
  magdalena: '33333333-3333-4333-8333-000000000003',
  guajira: '33333333-3333-4333-8333-000000000101',
} as const;

const FLEET = {
  cartagena: '55555555-5555-4555-8555-000000000001',
} as const;

const VEH = {
  abc123: '44444444-4444-4444-8444-000000000001',
  xyz456: '44444444-4444-4444-8444-000000000002',
  klm789: '44444444-4444-4444-8444-000000000003',
  qwe321: '44444444-4444-4444-8444-000000000004',
  rst654: '44444444-4444-4444-8444-000000000005',
  nor321: '44444444-4444-4444-8444-000000000101',
} as const;

async function main() {
  const passwordHash = await argon2.hash('demo123');

  await prisma.business.upsert({
    where: { id: DEMO_BUSINESS_ID },
    update: { name: 'Taller Demo Fleet' },
    create: { id: DEMO_BUSINESS_ID, name: 'Taller Demo Fleet' },
  });
  await prisma.business.upsert({
    where: { id: NORTE_BUSINESS_ID },
    update: { name: 'Lubricantes del Norte' },
    create: { id: NORTE_BUSINESS_ID, name: 'Lubricantes del Norte' },
  });

  const admin = await upsertUser(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'admin@fleet.local',
    'Admin Demo',
    passwordHash,
  );
  const norteAdmin = await upsertUser(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'admin@norte.local',
    'Admin Norte',
    passwordHash,
  );
  const operator = await upsertUser(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    'operador@fleet.local',
    'Operador Demo',
    passwordHash,
  );
  const inventory = await upsertUser(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    'inventario@fleet.local',
    'Inventario Demo',
    passwordHash,
  );

  await membership(admin.id, DEMO_BUSINESS_ID, ['ADMIN']);
  await membership(norteAdmin.id, NORTE_BUSINESS_ID, ['ADMIN']);
  await membership(operator.id, DEMO_BUSINESS_ID, ['OPERATOR']);
  await membership(operator.id, NORTE_BUSINESS_ID, ['OPERATOR']);
  await membership(inventory.id, DEMO_BUSINESS_ID, ['INVENTORY']);

  await seedCustomers();
  await seedFleetsAndVehicles();
}

async function upsertUser(id: string, email: string, fullName: string, passwordHash: string) {
  return prisma.user.upsert({
    where: { email },
    update: { fullName, passwordHash, status: 'ACTIVE' },
    create: { id, email, fullName, passwordHash, status: 'ACTIVE' },
  });
}

async function membership(userId: string, businessId: string, roleCodes: string[]) {
  await prisma.userBusinessMembership.upsert({
    where: { userId_businessId: { userId, businessId } },
    update: { roleCodes, permissions: permissionsForRoles(roleCodes), status: 'ACTIVE' },
    create: {
      userId,
      businessId,
      roleCodes,
      permissions: permissionsForRoles(roleCodes),
      status: 'ACTIVE',
    },
  });
}

async function seedCustomers() {
  await prisma.customer.upsert({
    where: { id: CUST.juan },
    update: {},
    create: {
      id: CUST.juan,
      businessId: DEMO_BUSINESS_ID,
      type: 'PERSON',
      status: 'ACTIVE',
      documentType: 'CC',
      documentNumber: '1234567890',
      firstName: 'Juan',
      lastName: 'Pérez',
      phone: '3001112233',
      email: 'juan@example.com',
      address: 'Cartagena',
    },
  });
  await prisma.customer.upsert({
    where: { id: CUST.abc },
    update: {},
    create: {
      id: CUST.abc,
      businessId: DEMO_BUSINESS_ID,
      type: 'COMPANY',
      status: 'ACTIVE',
      nit: '800999888-1',
      legalName: 'Transportes ABC S.A.S.',
      tradeName: 'ABC Flotas',
      contactName: 'María López',
      phone: '3002223344',
      email: 'flotas@abc.com',
    },
  });
  await prisma.customer.upsert({
    where: { id: CUST.magdalena },
    update: {},
    create: {
      id: CUST.magdalena,
      businessId: DEMO_BUSINESS_ID,
      type: 'COMPANY',
      status: 'ACTIVE',
      nit: '901222333-4',
      legalName: 'Logística Magdalena S.A.S.',
      tradeName: 'Magdalena Cargo',
      contactName: 'Ana Ruiz',
      phone: '3003334455',
      email: 'ops@magdalena.local',
    },
  });
  await prisma.customer.upsert({
    where: { id: CUST.guajira },
    update: {},
    create: {
      id: CUST.guajira,
      businessId: NORTE_BUSINESS_ID,
      type: 'COMPANY',
      status: 'ACTIVE',
      nit: '890123456-1',
      legalName: 'Rutas de la Guajira S.A.S.',
      tradeName: 'Rutas de la Guajira',
      contactName: 'Elena Díaz',
      phone: '3005550101',
      email: 'ops@guajira.local',
    },
  });
}

async function seedFleetsAndVehicles() {
  await prisma.fleet.upsert({
    where: { id: FLEET.cartagena },
    update: {},
    create: {
      id: FLEET.cartagena,
      businessId: DEMO_BUSINESS_ID,
      customerId: CUST.abc,
      name: 'Flota Cartagena',
      description: 'Operación costa',
      status: 'ACTIVE',
    },
  });

  await upsertVehicle({
    id: VEH.abc123,
    businessId: DEMO_BUSINESS_ID,
    customerId: CUST.juan,
    fleetId: null,
    plate: 'ABC123',
    vin: 'JTDBR32E720000001',
    brand: 'Toyota',
    line: 'Corolla',
    model: 'Corolla',
    year: 2020,
    vehicleType: 'SEDAN',
    color: 'Blanco',
    fuelType: 'GASOLINA',
    engineCapacity: '1.8',
    currentMileage: 85430,
  });
  await upsertVehicle({
    id: VEH.xyz456,
    businessId: DEMO_BUSINESS_ID,
    customerId: CUST.abc,
    fleetId: FLEET.cartagena,
    plate: 'XYZ456',
    brand: 'Chevrolet',
    line: 'N300',
    year: 2019,
    vehicleType: 'VAN',
    color: 'Gris',
    fuelType: 'GASOLINA',
    currentMileage: 120200,
  });
  await upsertVehicle({
    id: VEH.klm789,
    businessId: DEMO_BUSINESS_ID,
    customerId: CUST.abc,
    fleetId: FLEET.cartagena,
    plate: 'KLM789',
    brand: 'Chevrolet',
    line: 'NPR',
    year: 2021,
    vehicleType: 'CAMION',
    color: 'Blanco',
    fuelType: 'DIESEL',
    currentMileage: 64310,
  });
  await upsertVehicle({
    id: VEH.qwe321,
    businessId: DEMO_BUSINESS_ID,
    customerId: CUST.abc,
    fleetId: FLEET.cartagena,
    plate: 'QWE321',
    brand: 'Foton',
    line: 'Aumark',
    year: 2022,
    vehicleType: 'CAMION',
    color: 'Rojo',
    fuelType: 'DIESEL',
    currentMileage: 28100,
  });
  await upsertVehicle({
    id: VEH.rst654,
    businessId: DEMO_BUSINESS_ID,
    customerId: CUST.abc,
    fleetId: null,
    plate: 'RST654',
    brand: 'Renault',
    line: 'Master',
    year: 2020,
    vehicleType: 'VAN',
    color: 'Azul',
    fuelType: 'DIESEL',
    currentMileage: 91000,
  });
  await upsertVehicle({
    id: VEH.nor321,
    businessId: NORTE_BUSINESS_ID,
    customerId: CUST.guajira,
    fleetId: null,
    plate: 'NOR321',
    brand: 'Kenworth',
    line: 'T680',
    year: 2021,
    vehicleType: 'CAMION',
    color: 'Blanco',
    fuelType: 'DIESEL',
    currentMileage: 210400,
  });

  await assignIfMissing(FLEET.cartagena, VEH.xyz456, DEMO_BUSINESS_ID);
  await assignIfMissing(FLEET.cartagena, VEH.klm789, DEMO_BUSINESS_ID);
  await assignIfMissing(FLEET.cartagena, VEH.qwe321, DEMO_BUSINESS_ID);
}

async function upsertVehicle(data: {
  id: string;
  businessId: string;
  customerId: string;
  fleetId: string | null;
  plate: string;
  vin?: string;
  brand: string;
  line: string;
  model?: string;
  year?: number;
  vehicleType?: string;
  color?: string;
  fuelType?: string;
  engineCapacity?: string;
  currentMileage: number;
}) {
  const existing = await prisma.vehicle.findUnique({ where: { id: data.id } });
  if (existing) {
    return existing;
  }
  const vehicle = await prisma.vehicle.create({ data });
  await prisma.vehicleMileageLog.create({
    data: {
      businessId: data.businessId,
      vehicleId: vehicle.id,
      mileage: data.currentMileage,
      source: 'MANUAL',
    },
  });
  return vehicle;
}

async function assignIfMissing(fleetId: string, vehicleId: string, businessId: string) {
  const open = await prisma.fleetVehicle.findFirst({
    where: { vehicleId, unassignedAt: null },
  });
  if (open) {
    return;
  }
  await prisma.fleetVehicle.create({
    data: { businessId, fleetId, vehicleId },
  });
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
