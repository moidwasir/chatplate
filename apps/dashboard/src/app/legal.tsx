import type { ReactNode } from 'react';

/** Shared layout for the public policy pages (no login needed; linked from Meta) */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 text-gray-300">
      <div className="mb-8">
        <div className="text-2xl font-bold text-green-400">
          Chat<span className="text-orange-500">Plate</span>
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-gray-100">{title}</h1>
        <p className="mt-1 text-sm text-gray-500">Last updated: {updated}</p>
      </div>
      <div className="space-y-5 leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-gray-100 [&_li]:ml-5 [&_li]:list-disc [&_a]:text-green-400">
        {children}
      </div>
    </main>
  );
}

export const CONTACT_EMAIL = 'moeed.mehmood@gmail.com';
