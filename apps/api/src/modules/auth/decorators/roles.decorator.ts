import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Restrict a route/controller to the given roles. No decorator = any signed-in staff. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
