'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-store';

/** Restores the session once per page load */
export function AuthBootstrap() {
  useEffect(() => {
    if (useAuth.getState().status === 'loading') void useAuth.getState().bootstrap();
  }, []);
  return null;
}
