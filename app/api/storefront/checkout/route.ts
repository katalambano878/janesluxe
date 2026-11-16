import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      orderNumber,
      trackingNumber,
      userId,
      email,
      phone,
      subtotal,
      tax,
      shippingCost,
      total,
      deliveryMethod,
      paymentMethod,
      shippingData,
      cart,
      branch,
    } = body;

    if (!orderNumber || !cart?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const isValidUUID = (str: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    const productIds = cart.map((i: any) => i.id).filter(isValidUUID);
    const { data: productsData } = productIds.length > 0
      ? await supabaseAdmin.from('products').select('id, metadata, status').in('id', productIds)
      : { data: [] };
    const productMetaMap = new Map(
      (productsData || [])
        .filter((p: any) => p.status === 'active')
        .map((p: any) => [p.id, p.metadata])
    );

    const resolvedItems: { item: any; productId: string; metadata: any }[] = [];
    for (const item of cart) {
      let productId = item.id;

      if (!isValidUUID(productId)) {
        const { data: product } = await supabaseAdmin
          .from('products')
          .select('id, metadata, status')
          .eq('slug', productId)
          .eq('status', 'active')
          .single();

        if (!product) {
          return NextResponse.json(
            { error: `${item.name || 'A product'} is no longer available. Please remove it from your cart.` },
            { status: 400 }
          );
        }
        productId = product.id;
        productMetaMap.set(product.id, product.metadata);
      }

      if (!productMetaMap.has(productId)) {
        return NextResponse.json(
          { error: `${item.name || 'A product'} is no longer available. Please remove it from your cart.` },
          { status: 400 }
        );
      }

      resolvedItems.push({ item, productId, metadata: productMetaMap.get(productId) });
    }

    // 1. Create Order
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert([{
        order_number: orderNumber,
        user_id: userId || null,
        branch_id: branch?.id || null,
        email,
        phone,
        status: 'pending',
        payment_status: 'pending',
        currency: 'GHS',
        subtotal,
        tax_total: tax,
        shipping_total: shippingCost,
        discount_total: 0,
        total,
        shipping_method: deliveryMethod,
        payment_method: paymentMethod,
        shipping_address: shippingData,
        billing_address: shippingData,
        metadata: {
          guest_checkout: !userId,
          first_name: shippingData.firstName,
          last_name: shippingData.lastName,
          tracking_number: trackingNumber,
          branch_name: branch?.name || null,
          branch_slug: branch?.slug || null,
        },
      }])
      .select()
      .single();

    if (orderError) {
      console.error('Order insert error:', orderError);
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    const orderItems = resolvedItems.map(({ item, productId, metadata: prodMeta }) => ({
      order_id: order.id,
      product_id: productId,
      product_name: item.name,
      variant_name: item.variant || null,
      quantity: item.quantity,
      unit_price: item.price,
      total_price: item.price * item.quantity,
      metadata: {
        image: item.image,
        slug: item.slug,
        preorder_shipping: prodMeta?.preorder_shipping || null,
      },
    }));

    const { error: itemsError } = await supabaseAdmin.from('order_items').insert(orderItems);
    if (itemsError) {
      console.error('Order items insert error:', itemsError);
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    // 3. Upsert customer record
    const fullName = `${shippingData.firstName} ${shippingData.lastName}`.trim();
    try {
      await supabaseAdmin.rpc('upsert_customer_from_order', {
        p_email: shippingData.email,
        p_phone: shippingData.phone,
        p_full_name: fullName,
        p_first_name: shippingData.firstName,
        p_last_name: shippingData.lastName,
        p_user_id: userId || null,
        p_address: shippingData,
      });
    } catch (e: any) {
      console.warn('upsert_customer_from_order warning:', e.message);
    }

    return NextResponse.json({ order });
  } catch (e: any) {
    console.error('Checkout API error:', e);
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
