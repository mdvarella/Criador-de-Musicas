'use client';

import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

export function AdminSignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="rounded-full border border-cream-deep px-3 py-1.5 text-sm hover:bg-cream"
      onClick={async () => {
        await supabaseBrowser().auth.signOut();
        router.push('/admin/login');
        router.refresh();
      }}
    >
      Sair
    </button>
  );
}
