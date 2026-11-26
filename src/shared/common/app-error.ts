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
  invalidGoogleToken: () =>
    new AppError('INVALID_GOOGLE_TOKEN', 'El token de Google no es válido.', 401),
  emailNotVerified: () =>
    new AppError(
      'EMAIL_NOT_VERIFIED',
      'El correo de Google no está verificado.',
      403,
    ),
  accountExistsUsePassword: () =>
    new AppError(
      'ACCOUNT_EXISTS',
      'Ya existe una cuenta con este correo. Inicia sesión con contraseña y vincula Google.',
      409,
    ),
  googleNotLinked: () =>
    new AppError(
      'GOOGLE_NOT_LINKED',
      'Esta cuenta de Google no está vinculada. Inicia sesión con contraseña, acepta una invitación o vincula Google desde tu perfil.',
      403,
    ),
  businessNotActive: () =>
    new AppError(
      'BUSINESS_NOT_ACTIVE',
      'El negocio no está activo o la invitación no puede usarse aún.',
      403,
    ),
  googleAlreadyLinked: () =>
    new AppError(
      'GOOGLE_ALREADY_LINKED',
      'Esta cuenta de Google ya está vinculada a otro usuario.',
      409,
    ),
  passwordAlreadySet: () =>
    new AppError('PASSWORD_ALREADY_SET', 'La cuenta ya tiene contraseña.', 409),
  passwordRequired: () =>
    new AppError(
      'PASSWORD_REQUIRED',
      'Debes indicar la contraseña actual para cambiarla.',
      400,
    ),
  googleNotConfigured: () =>
    new AppError(
      'GOOGLE_NOT_CONFIGURED',
      'Google Sign-In no está configurado en este entorno.',
      503,
    ),
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
  serviceOrderNotFound: () =>
    new AppError('SERVICE_ORDER_NOT_FOUND', 'Orden de trabajo no encontrada.', 404),
  invalidOrderTransition: (message = 'Transición de estado no permitida.') =>
    new AppError('INVALID_ORDER_TRANSITION', message, 409),
  orderNotEditable: () =>
    new AppError(
      'ORDER_NOT_EDITABLE',
      'No se puede editar una orden completada o cancelada.',
      409,
    ),
  orderAlreadyCompleted: () =>
    new AppError('ORDER_ALREADY_COMPLETED', 'La orden ya está completada.', 409),
  vehicleCustomerMismatch: () =>
    new AppError(
      'VEHICLE_CUSTOMER_MISMATCH',
      'El vehículo no pertenece al cliente indicado.',
      409,
    ),
  serviceTypeNotFound: () =>
    new AppError('SERVICE_TYPE_NOT_FOUND', 'Tipo de servicio no encontrado.', 404),
  serviceTypeInvalid: (message = 'Datos de tipo de servicio inválidos.') =>
    new AppError('SERVICE_TYPE_INVALID', message, 400),
  serviceTypeCodeExists: (code: string) =>
    new AppError(
      'SERVICE_TYPE_CODE_EXISTS',
      'El código de tipo de servicio ya existe en este negocio.',
      409,
      { code },
    ),
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
  businessNotFound: () =>
    new AppError('BUSINESS_NOT_FOUND', 'Empresa no encontrada.', 404),
  invitationNotFound: () =>
    new AppError('INVITATION_NOT_FOUND', 'Invitación no encontrada o inválida.', 404),
  invitationExpired: () =>
    new AppError('INVITATION_EXPIRED', 'La invitación ha expirado.', 410),
  invitationNotPending: () =>
    new AppError('INVITATION_NOT_PENDING', 'La invitación ya no está pendiente.', 409),
  invitationEmailMismatch: () =>
    new AppError(
      'INVITATION_EMAIL_MISMATCH',
      'Debes iniciar sesión con el correo al que se envió la invitación.',
      403,
    ),
  businessSuspended: () =>
    new AppError('BUSINESS_SUSPENDED', 'La empresa está suspendida.', 409),
  categoryNotFound: () =>
    new AppError('CATEGORY_NOT_FOUND', 'Categoría no encontrada.', 404),
  categoryInvalid: (message = 'Datos de categoría inválidos.') =>
    new AppError('CATEGORY_INVALID', message, 400),
  categoryNameExists: () =>
    new AppError(
      'CATEGORY_NAME_EXISTS',
      'Ya existe una categoría con ese nombre en este negocio.',
      409,
    ),
  categoryHierarchyInvalid: (message = 'La jerarquía de categorías no es válida.') =>
    new AppError('CATEGORY_HIERARCHY_INVALID', message, 400),
  categoryInUse: () =>
    new AppError(
      'CATEGORY_IN_USE',
      'La categoría tiene productos o subcategorías asociadas y no se puede desactivar.',
      409,
    ),
  categoryRequired: () =>
    new AppError(
      'CATEGORY_REQUIRED',
      'Debes indicar una categoría. El negocio ya tiene categorías configuradas.',
      400,
    ),
  brandNotFound: () =>
    new AppError('BRAND_NOT_FOUND', 'Marca no encontrada.', 404),
  brandInvalid: (message = 'Datos de marca inválidos.') =>
    new AppError('BRAND_INVALID', message, 400),
  brandNameExists: () =>
    new AppError(
      'BRAND_NAME_EXISTS',
      'Ya existe una marca con ese nombre en este negocio.',
      409,
    ),
  brandInUse: () =>
    new AppError(
      'BRAND_IN_USE',
      'La marca tiene productos asociados y no se puede desactivar.',
      409,
    ),
  classificationInactive: (message = 'No se puede asignar una categoría o marca inactiva.') =>
    new AppError('CLASSIFICATION_INACTIVE', message, 409),
};
