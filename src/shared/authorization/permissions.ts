export const Permission = {
  InventoryRead: 'inventory.read',
  InventoryWrite: 'inventory.write',
  InventoryAdjust: 'inventory.adjust',
  CustomersRead: 'customers.read',
  CustomersWrite: 'customers.write',
  VehiclesRead: 'vehicles.read',
  VehiclesWrite: 'vehicles.write',
  FleetsRead: 'fleets.read',
  FleetsWrite: 'fleets.write',
  OrdersComplete: 'orders.complete',
  SalesConfirm: 'sales.confirm',
  SalesCancel: 'sales.cancel',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const OPERATIONS_READ = [
  Permission.CustomersRead,
  Permission.VehiclesRead,
  Permission.FleetsRead,
] as const;

const OPERATIONS_WRITE = [
  Permission.CustomersWrite,
  Permission.VehiclesWrite,
  Permission.FleetsWrite,
] as const;

export const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  ADMIN: [
    Permission.InventoryRead,
    Permission.InventoryWrite,
    Permission.InventoryAdjust,
    ...OPERATIONS_READ,
    ...OPERATIONS_WRITE,
    Permission.OrdersComplete,
    Permission.SalesConfirm,
    Permission.SalesCancel,
  ],
  INVENTORY: [Permission.InventoryRead, Permission.InventoryWrite],
  OPERATOR: [
    ...OPERATIONS_READ,
    Permission.OrdersComplete,
    Permission.SalesConfirm,
    Permission.SalesCancel,
  ],
  TECHNICIAN: [Permission.OrdersComplete],
  FLEET_MANAGER: [...OPERATIONS_READ, ...OPERATIONS_WRITE],
  CUSTOMER: [],
};

export function permissionsForRoles(roleCodes: string[]): string[] {
  return [...new Set(roleCodes.flatMap((role) => ROLE_PERMISSIONS[role] ?? []))];
}
