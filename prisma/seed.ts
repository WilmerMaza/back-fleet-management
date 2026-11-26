import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
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

const SUPER_ADMIN_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0';
const SUPER_ADMIN_EMAIL = 'wilmermaza10@gmail.com';

const SYSTEM_ROLE_DEFS: { code: string; name: string; description: string }[] = [
  { code: 'ADMIN', name: 'Administrador', description: 'Administración del negocio' },
  { code: 'INVENTORY', name: 'Inventario', description: 'Gestión de inventario' },
  { code: 'OPERATOR', name: 'Operador', description: 'Operación diaria' },
  { code: 'TECHNICIAN', name: 'Técnico', description: 'Órdenes de servicio' },
  { code: 'FLEET_MANAGER', name: 'Gestor de flota', description: 'Clientes, vehículos y flotas' },
  { code: 'CUSTOMER', name: 'Cliente portal', description: 'Sin permisos de cabina' },
];

const PERMISSION_DEFS: { code: string; description: string; module: string }[] = [
  { code: 'inventory.read', description: 'Ver inventario', module: 'inventory' },
  { code: 'inventory.write', description: 'Editar inventario', module: 'inventory' },
  { code: 'inventory.adjust', description: 'Ajustar stock', module: 'inventory' },
  { code: 'inventory.categories.read', description: 'Ver categorías de producto', module: 'inventory' },
  { code: 'inventory.categories.write', description: 'Administrar categorías de producto', module: 'inventory' },
  { code: 'inventory.brands.read', description: 'Ver marcas de producto', module: 'inventory' },
  { code: 'inventory.brands.write', description: 'Administrar marcas de producto', module: 'inventory' },
  { code: 'customers.read', description: 'Ver clientes', module: 'customers' },
  { code: 'customers.write', description: 'Editar clientes', module: 'customers' },
  { code: 'vehicles.read', description: 'Ver vehículos', module: 'vehicles' },
  { code: 'vehicles.write', description: 'Editar vehículos', module: 'vehicles' },
  { code: 'fleets.read', description: 'Ver flotas', module: 'fleets' },
  { code: 'fleets.write', description: 'Editar flotas', module: 'fleets' },
  { code: 'service_catalog.read', description: 'Ver catálogo de servicios', module: 'service_catalog' },
  { code: 'service_catalog.write', description: 'Editar catálogo de servicios', module: 'service_catalog' },
  { code: 'orders.read', description: 'Ver órdenes de trabajo', module: 'orders' },
  { code: 'orders.write', description: 'Crear y editar órdenes de trabajo', module: 'orders' },
  { code: 'orders.complete', description: 'Completar órdenes', module: 'orders' },
  { code: 'sales.confirm', description: 'Confirmar ventas', module: 'sales' },
  { code: 'sales.cancel', description: 'Cancelar ventas', module: 'sales' },
  { code: 'roles.read', description: 'Ver roles', module: 'roles' },
  { code: 'roles.write', description: 'Editar roles', module: 'roles' },
  { code: 'users.read', description: 'Ver miembros del negocio', module: 'users' },
  { code: 'users.admin', description: 'Administrar miembros e invitaciones', module: 'users' },
  { code: 'platform.businesses.read', description: 'Ver empresas (plataforma)', module: 'platform' },
  { code: 'platform.businesses.write', description: 'Gestionar empresas (plataforma)', module: 'platform' },
  { code: 'platform.users.read', description: 'Ver usuarios (plataforma)', module: 'platform' },
  { code: 'platform.roles.read', description: 'Ver roles (plataforma)', module: 'platform' },
];

async function main() {
  const passwordHash = await argon2.hash('demo123');

  await prisma.business.upsert({
    where: { id: DEMO_BUSINESS_ID },
    update: {
      name: 'Taller KONTI',
      legalName: 'Taller KONTI S.A.S.',
      taxId: '900111222-3',
      email: 'contacto@taller-konti.local',
      phone: '3001110000',
      address: 'Cartagena',
      status: 'ACTIVE',
    },
    create: {
      id: DEMO_BUSINESS_ID,
      name: 'Taller KONTI',
      legalName: 'Taller KONTI S.A.S.',
      taxId: '900111222-3',
      email: 'contacto@taller-konti.local',
      phone: '3001110000',
      address: 'Cartagena',
      status: 'ACTIVE',
    },
  });
  await prisma.business.upsert({
    where: { id: NORTE_BUSINESS_ID },
    update: {
      name: 'Lubricantes del Norte',
      legalName: 'Lubricantes del Norte S.A.S.',
      taxId: '900222333-4',
      email: 'contacto@norte.local',
      phone: '3002220000',
      address: 'Barranquilla',
      status: 'ACTIVE',
    },
    create: {
      id: NORTE_BUSINESS_ID,
      name: 'Lubricantes del Norte',
      legalName: 'Lubricantes del Norte S.A.S.',
      taxId: '900222333-4',
      email: 'contacto@norte.local',
      phone: '3002220000',
      address: 'Barranquilla',
      status: 'ACTIVE',
    },
  });

  await seedPermissionsAndRoles();

  const admin = await upsertUser(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'admin@fleet.local',
    'Administrador Fleet',
    passwordHash,
  );
  const norteAdmin = await upsertUser(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'admin@norte.local',
    'Administrador Norte',
    passwordHash,
  );
  const operator = await upsertUser(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    'operador@fleet.local',
    'Operador Fleet',
    passwordHash,
  );
  const inventory = await upsertUser(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    'inventario@fleet.local',
    'Inventario Fleet',
    passwordHash,
  );
  const platformAdmin = await upsertUser(
    SUPER_ADMIN_USER_ID,
    SUPER_ADMIN_EMAIL,
    'Wilmer Maza',
    passwordHash,
    'SUPER_ADMIN',
  );

  await membership(admin.id, DEMO_BUSINESS_ID, ['ADMIN']);
  await membership(norteAdmin.id, NORTE_BUSINESS_ID, ['ADMIN']);
  await membership(operator.id, DEMO_BUSINESS_ID, ['OPERATOR']);
  await membership(operator.id, NORTE_BUSINESS_ID, ['OPERATOR']);
  await membership(inventory.id, DEMO_BUSINESS_ID, ['INVENTORY']);
  // Superadmin de plataforma opera Taller KONTI (membresía ADMIN + platformRole).
  await membership(platformAdmin.id, DEMO_BUSINESS_ID, ['ADMIN']);

  await seedCustomers();
  await seedFleetsAndVehicles();
  await seedServiceTypes();
}

async function seedPermissionsAndRoles() {
  for (const perm of PERMISSION_DEFS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { description: perm.description, module: perm.module },
      create: {
        id: cryptoRandom(),
        code: perm.code,
        description: perm.description,
        module: perm.module,
      },
    });
  }

  const allPerms = await prisma.permission.findMany();
  const byCode = new Map(allPerms.map((p) => [p.code, p.id]));

  const platformRole = await upsertPlatformRole();
  const platformCodes = PERMISSION_DEFS.filter((p) => p.module === 'platform').map((p) => p.code);
  await syncRolePermissions(platformRole.id, platformCodes, byCode);

  const businesses = await prisma.business.findMany({ select: { id: true } });
  for (const { id: businessId } of businesses) {
    for (const def of SYSTEM_ROLE_DEFS) {
      const role = await upsertBusinessRole(businessId, def);
      await syncRolePermissions(role.id, permissionsForRoles([def.code]), byCode);
    }
  }
}

async function upsertPlatformRole() {
  const existing = await prisma.role.findFirst({
    where: { businessId: null, code: 'SUPER_ADMIN' },
  });
  if (existing) {
    return prisma.role.update({
      where: { id: existing.id },
      data: {
        name: 'Superadministrador',
        description: 'Administración global de KONTI',
        isSystem: true,
      },
    });
  }
  return prisma.role.create({
    data: {
      id: cryptoRandom(),
      businessId: null,
      code: 'SUPER_ADMIN',
      name: 'Superadministrador',
      description: 'Administración global de KONTI',
      isSystem: true,
    },
  });
}

async function upsertBusinessRole(
  businessId: string,
  def: { code: string; name: string; description: string },
) {
  const existing = await prisma.role.findFirst({
    where: { businessId, code: def.code },
  });
  if (existing) {
    return prisma.role.update({
      where: { id: existing.id },
      data: { name: def.name, description: def.description, isSystem: true },
    });
  }
  return prisma.role.create({
    data: {
      id: cryptoRandom(),
      businessId,
      code: def.code,
      name: def.name,
      description: def.description,
      isSystem: true,
    },
  });
}

async function syncRolePermissions(
  roleId: string,
  codes: readonly string[],
  byCode: Map<string, string>,
) {
  const permissionIds = codes
    .map((code) => byCode.get(code))
    .filter((id): id is string => Boolean(id));
  await prisma.rolePermission.deleteMany({ where: { roleId } });
  if (!permissionIds.length) {
    return;
  }
  await prisma.rolePermission.createMany({
    data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
    skipDuplicates: true,
  });
}

function cryptoRandom(): string {
  return randomUUID();
}

async function upsertUser(
  id: string,
  email: string,
  fullName: string,
  passwordHash: string,
  platformRole?: 'SUPER_ADMIN',
) {
  return prisma.user.upsert({
    where: { email },
    update: {
      fullName,
      passwordHash,
      status: 'ACTIVE',
      ...(platformRole ? { platformRole } : {}),
    },
    create: {
      id,
      email,
      fullName,
      passwordHash,
      status: 'ACTIVE',
      platformRole: platformRole ?? null,
    },
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

const SERVICE_TYPE_SEEDS: {
  id: string;
  businessId: string;
  code: string;
  name: string;
  category: string;
  parameters?: Record<string, unknown>;
}[] = [
  {
    id: '66666666-6666-4666-8666-000000000001',
    businessId: DEMO_BUSINESS_ID,
    code: 'CAMBIO_ACEITE',
    name: 'Cambio de aceite',
    category: 'MANTENIMIENTO',
    parameters: { defaultEveryKm: 10000, defaultEveryMonths: 6 },
  },
  {
    id: '66666666-6666-4666-8666-000000000002',
    businessId: DEMO_BUSINESS_ID,
    code: 'CAMBIO_FILTRO',
    name: 'Cambio de filtro',
    category: 'MANTENIMIENTO',
  },
  {
    id: '66666666-6666-4666-8666-000000000003',
    businessId: DEMO_BUSINESS_ID,
    code: 'REVISION_FRENOS',
    name: 'Revisión de frenos',
    category: 'MANTENIMIENTO',
  },
  {
    id: '66666666-6666-4666-8666-000000000101',
    businessId: NORTE_BUSINESS_ID,
    code: 'CAMBIO_ACEITE',
    name: 'Cambio de aceite',
    category: 'MANTENIMIENTO',
    parameters: { defaultEveryKm: 8000, defaultEveryMonths: 6 },
  },
];

async function seedServiceTypes() {
  for (const item of SERVICE_TYPE_SEEDS) {
    await prisma.serviceType.upsert({
      where: { id: item.id },
      update: {
        name: item.name,
        category: item.category,
        status: 'ACTIVE',
        parameters: item.parameters ?? undefined,
      },
      create: {
        id: item.id,
        businessId: item.businessId,
        code: item.code,
        name: item.name,
        category: item.category,
        status: 'ACTIVE',
        parameters: item.parameters ?? undefined,
      },
    });
  }
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
