import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../auth.types';

/** Inject the authenticated staff user: `@CurrentUser() user: AuthUser` */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
