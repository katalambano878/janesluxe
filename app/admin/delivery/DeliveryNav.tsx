'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function DeliveryNav() {
    const pathname = usePathname();
    const tabs = [
        { label: 'Overview', href: '/admin/delivery', icon: 'ri-dashboard-line', exact: true },
        { label: 'Assignments', href: '/admin/delivery/assignments', icon: 'ri-route-line' },
        { label: 'Riders', href: '/admin/delivery/riders', icon: 'ri-e-bike-2-line' },
        { label: 'Zones', href: '/admin/delivery/zones', icon: 'ri-map-pin-range-line' },
    ];

    return (
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl overflow-x-auto">
            {tabs.map(tab => {
                const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
                return (
                    <Link key={tab.href} href={tab.href}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                            isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}>
                        <i className={`${tab.icon} text-base`} />
                        {tab.label}
                    </Link>
                );
            })}
        </div>
    );
}
