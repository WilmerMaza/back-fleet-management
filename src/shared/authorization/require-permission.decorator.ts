import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'konti:permission';

export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);
