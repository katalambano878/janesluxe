import { getDashboardSmsCredit } from '@/lib/sms-credit-cache';
import AdminDashboardClient from './AdminDashboardClient';

export default async function AdminDashboardPage() {
  const smsCredit = await getDashboardSmsCredit();
  return <AdminDashboardClient smsCredit={smsCredit} />;
}
