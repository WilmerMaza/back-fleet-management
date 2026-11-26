export const Permission = {
  InventoryRead: 'inventory.read',
  InventoryWrite: 'inventory.write',
  InventoryAdjust: 'inventory.adjust',
  InventoryCategoriesRead: 'inventory.categories.read',
  InventoryCategoriesWrite: 'inventory.categories.write',
  InventoryBrandsRead: 'inventory.brands.read',
  InventoryBrandsWrite: 'inventory.brands.write',
  CustomersRead: 'customers.read',
  CustomersWrite: 'customers.write',
  VehiclesRead: 'vehicles.read',
  VehiclesWrite: 'vehicles.write',
  FleetsRead: 'fleets.read',
  FleetsWrite: 'fleets.write',
  ServiceCatalogRead: 'service_catalog.read',
  ServiceCatalogWrite: 'service_catalog.write',
  OrdersRead: 'orders.read',
  OrdersWrite: 'orders.write',
  OrdersComplete: 'orders.complete',
  SalesConfirm: 'sales.confirm',
  SalesCancel: 'sales.cancel',
  RolesRead: 'roles.read',
  RolesWrite: 'roles.write',
  UsersRead: 'users.read',
  UsersAdmin: 'users.admin',
  PlatformBusinessesRead: 'platform.businesses.read',
  PlatformBusinessesWrite: 'platform.businesses.write',
  PlatformUsersRead: 'platform.users.read',
  PlatformRolesRead: 'platform.roles.read',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const OPERATIONS_READ = [
  Permission.CustomersRead,
  Permission.VehiclesRead,
  Permission.FleetsRead,
  Permission.ServiceCatalogRead,
  Permission.OrdersRead,
] as const;

const OPERATIONS_WRITE = [
  Permission.CustomersWrite,
  Permission.VehiclesWrite,
  Permission.FleetsWrite,
  Permission.ServiceCatalogWrite,
  Permission.OrdersWrite,
] as const;

export const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  ADMIN: [
    Permission.InventoryRead,
    Permission.InventoryWrite,
    Permission.InventoryAdjust,
    Permission.InventoryCategoriesRead,
    Permission.InventoryCategoriesWrite,
    Permission.InventoryBrandsRead,
    Permission.InventoryBrandsWrite,
    ...OPERATIONS_READ,
    ...OPERATIONS_WRITE,
    Permission.OrdersComplete,
    Permission.SalesConfirm,
    Permission.SalesCancel,
    Permission.RolesRead,
    Permission.RolesWrite,
    Permission.UsersRead,
    Permission.UsersAdmin,
  ],
  SUPER_ADMIN: [
    Permission.PlatformBusinessesRead,
    Permission.PlatformBusinessesWrite,
    Permission.PlatformUsersRead,
    Permission.PlatformRolesRead,
  ],
  INVENTORY: [
    Permission.InventoryRead,
    Permission.InventoryWrite,
    Permission.InventoryAdjust,
    Permission.InventoryCategoriesRead,
    Permission.InventoryCategoriesWrite,
    Permission.InventoryBrandsRead,
    Permission.InventoryBrandsWrite,
    /** Ver órdenes (nav + indicadores del dashboard). */
    Permission.OrdersRead,
  ],
  OPERATOR: [
    ...OPERATIONS_READ,
    ...OPERATIONS_WRITE,
    Permission.OrdersComplete,
    Permission.SalesConfirm,
    Permission.SalesCancel,
    Permission.InventoryRead,
    Permission.InventoryCategoriesRead,
    Permission.InventoryBrandsRead,
  ],
  TECHNICIAN: [
    Permission.OrdersRead,
    Permission.OrdersWrite,
    Permission.OrdersComplete,
    Permission.ServiceCatalogRead,
    Permission.InventoryRead,
    Permission.InventoryCategoriesRead,
    Permission.InventoryBrandsRead,
  ],
  FLEET_MANAGER: [...OPERATIONS_READ, ...OPERATIONS_WRITE],
  CUSTOMER: [],
};

export function permissionsForRoles(roleCodes: string[]): string[] {
  return [...new Set(roleCodes.flatMap((role) => ROLE_PERMISSIONS[role] ?? []))];
}
