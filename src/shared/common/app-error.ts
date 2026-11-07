export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  productNotFound: () =>
    new AppError('PRODUCT_NOT_FOUND', 'Producto no encontrado.', 404),
  skuExists: (sku: string) =>
    new AppError('SKU_ALREADY_EXISTS', 'El SKU ya existe en este negocio.', 409, { sku }),
  insufficientStock: (productId: string, available: string, requested: string) =>
    new AppError(
      'INSUFFICIENT_STOCK',
      'No hay existencias suficientes para completar la operación.',
      409,
      { productId, available, requested },
    ),
  invalidQuantity: () =>
    new AppError('INVALID_QUANTITY', 'La cantidad no es válida.', 400),
  invalidPrice: () =>
    new AppError('INVALID_PRICE', 'El precio no es válido.', 400),
  productInactive: () =>
    new AppError(
      'PRODUCT_INACTIVE',
      'El producto está inactivo y no puede usarse en una operación nueva.',
      409,
    ),
  invalidMovement: (message = 'Movimiento inválido.') =>
    new AppError('INVALID_MOVEMENT', message, 400),
  operationConflict: () =>
    new AppError(
      'OPERATION_ALREADY_PROCESSED',
      'La clave de operación ya se usó con datos distintos.',
      409,
    ),
  forbidden: () => new AppError('FORBIDDEN', 'Permiso insuficiente.', 403),
  tenantDenied: () =>
    new AppError('TENANT_ACCESS_DENIED', 'No hay acceso a este negocio.', 403),
  unauthorized: () => new AppError('UNAUTHORIZED', 'No autenticado.', 401),
  rateLimited: (retryAfterSec?: number) =>
    new AppError(
      'RATE_LIMITED',
      'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
      429,
      retryAfterSec != null ? { retryAfterSec } : undefined,
    ),
  selectBusiness: (businesses: { id: string; name: string }[]) =>
    new AppError('SELECT_BUSINESS', 'Selecciona un negocio.', 409, { businesses }),
  invalidCredentials: () =>
    new AppError('UNAUTHORIZED', 'Correo o contraseña incorrectos.', 401),
  customerNotFound: () =>
    new AppError('CUSTOMER_NOT_FOUND', 'Cliente no encontrado.', 404),
  customerDocumentExists: () =>
    new AppError('CUSTOMER_DOCUMENT_EXISTS', 'Ya existe un cliente con ese documento en este negocio.', 409),
  customerNitExists: () =>
    new AppError('CUSTOMER_NIT_EXISTS', 'Ya existe una empresa con ese NIT en este negocio.', 409),
  customerTypeInvalid: (message = 'Los datos no coinciden con el tipo de cliente.') =>
    new AppError('CUSTOMER_TYPE_INVALID', message, 400),
  vehicleNotFound: () =>
    new AppError('VEHICLE_NOT_FOUND', 'Vehículo no encontrado.', 404),
  plateExists: (plate: string) =>
    new AppError('PLATE_ALREADY_EXISTS', 'La placa ya existe en este negocio.', 409, { plate }),
  mileageDecreaseForbidden: () =>
    new AppError(
      'MILEAGE_DECREASE_FORBIDDEN',
      'El kilometraje no puede bajar. Solo un administrador puede registrar un ajuste auditado.',
      409,
    ),
  invalidMileage: () =>
    new AppError('INVALID_MILEAGE', 'El kilometraje no es válido.', 400),
  fleetNotFound: () =>
    new AppError('FLEET_NOT_FOUND', 'Flota no encontrada.', 404),
  fleetRequiresCompany: () =>
    new AppError('FLEET_REQUIRES_COMPANY', 'La flota debe pertenecer a un cliente empresa.', 400),
  fleetVehicleMismatch: () =>
    new AppError(
      'FLEET_VEHICLE_MISMATCH',
      'El vehículo debe ser del mismo cliente de la flota.',
      409,
    ),
};
