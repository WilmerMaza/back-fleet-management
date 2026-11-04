export interface RequestContext {
  userId: string;
  email: string;
  businessId: string;
  businessIds: string[];
  roles: string[];
  permissions: string[];
}

export const REQUEST_CONTEXT = 'konti:request-context';
