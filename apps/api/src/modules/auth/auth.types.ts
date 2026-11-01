import type { UserRole } from '@prisma/client';

/** Claims carried in the short-lived access token */
export interface JwtPayload {
  sub: string;
  role: UserRole;
  branchIds: string[];
}

/** Shape attached to `request.user` by JwtAuthGuard */
export interface AuthUser {
  id: string;
  role: UserRole;
  branchIds: string[];
}
