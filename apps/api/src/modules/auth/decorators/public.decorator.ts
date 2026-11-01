import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Skip JWT auth for this route/controller (webhooks, health, login) */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
