'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Overview' },
  { href: '/institutions', label: 'Institutions' },
  { href: '/transfers', label: 'Transfers' },
  { href: '/ledger', label: 'Ledger' },
  { href: '/balances', label: 'Balances' },
  { href: '/network', label: 'Network' },
  { href: '/admin', label: 'Admin' },
  { href: '/settings', label: 'Settings' }
];

export default function Navbar(): React.JSX.Element {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4 px-4 py-3 lg:px-8">
        <Link href="/" className="text-lg font-semibold tracking-tight text-ink">
          EUPayGrid
          <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">MVP</span>
        </Link>
        <nav className="flex flex-wrap gap-2">
          {links.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? 'bg-ink text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
