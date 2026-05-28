import OrderDetailClient from './OrderDetailClient';

export async function generateStaticParams() {
  return [
    { id: 'ORD-2024-324' },
    { id: 'ORD-2024-323' },
    { id: 'ORD-2024-322' }
  ];
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDetailClient orderId={id} />;
}
