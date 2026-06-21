/**
 * Site Knowledge Base — curated facts used by the AI chat assistant.
 */

export interface SiteKnowledgeEntry {
  id: string;
  title: string;
  path: string;
  category: string;
  content: string;
  keywords: string[];
}

export const SITE_KNOWLEDGE: SiteKnowledgeEntry[] = [
  {
    id: "business-overview",
    title: "About YOUR_BRAND_NAME",
    path: "/about",
    category: "company",
    content: `YOUR_BRAND_NAME is a premium global sourcing and procurement brand. We leverage a network of carefully vetted international suppliers and manufacturers to bring you high-quality, functional products at direct-from-supplier pricing.

We simplify the sourcing process by handling product selection support, supplier coordination and logistics through a preorder-based fulfillment system — so you can shop confidently without stress, uncertainty or inflated costs.

Whether you're buying for personal use, resale or business growth, YOUR_BRAND_NAME exists to make smart sourcing seamless, reliable and accessible.

Vision: To make luxury, quality and functionality easily accessible, without breaking the bank.
Mission: To become a globally trusted, personalized sourcing and shopping partner, delivering carefully curated international products, expert guidance and dependable logistics; one order at a time.

Delivery: Worldwide delivery.`,
    keywords: ["YOUR_BRAND_NAME", "global sourcing", "procurement", "international suppliers", "premium products", "preorder", "about", "supplier", "logistics"],
  },
  {
    id: "contact-info",
    title: "Contact Information",
    path: "/contact",
    category: "contact",
    content: `Contact YOUR_BRAND_NAME:

Phone/WhatsApp: YOUR_PHONE_NUMBER
Email: hello@yourdomain.com
Instagram: @YOUR_HANDLE
Address: Accra, Ghana
Support Hours: Monday to Saturday, 9 AM - 6 PM GMT`,
    keywords: ["contact", "phone", "whatsapp", "email", "address", "support", "YOUR_PHONE_NUMBER", "accra", "ghana", "instagram", "YOUR_HANDLE"],
  },
  {
    id: "shipping-policy",
    title: "Shipping & Delivery Policy",
    path: "/shipping",
    category: "shipping",
    content: `YOUR_BRAND_NAME ships from Accra, Ghana and offers nationwide and worldwide delivery.

Shipping fees and delivery timelines depend on destination and are shown at checkout.

Customers receive order updates and can track orders using order number and email.`,
    keywords: ["shipping", "delivery", "worldwide", "international", "timeline", "tracking", "accra", "ghana", "YOUR_BRAND_NAME"],
  },
  {
    id: "returns-policy",
    title: "Returns & Refunds Policy",
    path: "/returns",
    category: "returns",
    content: `Returns are accepted for eligible unused items in original condition within 30 days of delivery.

Custom or altered items may not be returnable unless there is a quality issue.

Refunds are processed after item inspection.`,
    keywords: ["returns", "refund", "exchange", "worn", "condition", "30 days"],
  },
  {
    id: "payment-methods",
    title: "Payment Methods",
    path: "/checkout",
    category: "payment",
    content: `Secure payments are processed by Paystack. Customers can pay with debit/credit cards (Visa, Mastercard), bank transfer, USSD, mobile money (MTN, Telecel, AirtelTigo), or QR code at checkout.

Cash on Delivery is available for eligible orders within Accra.
All prices are shown in GH₵ (GHS) unless otherwise stated.`,
    keywords: ["payment", "paystack", "card", "bank transfer", "ussd", "momo", "mobile money", "checkout", "secure", "ghs", "Ghana Cedis", "ghana"],
  },
  {
    id: "order-tracking-guide",
    title: "How to Track Your Order",
    path: "/order-tracking",
    category: "orders",
    content: `To track an order, go to /order-tracking and provide your order number and email address.

Typical status flow:
Order Placed -> Payment -> Processing -> Packaged -> Dispatched -> Delivered.`,
    keywords: ["track", "order", "status", "order number", "email", "dispatched"],
  },
  {
    id: "faq-summary",
    title: "Frequently Asked Questions",
    path: "/faqs",
    category: "faq",
    content: `FAQs cover orders, shipping, returns, payment, and account support.

Customers can contact support via WhatsApp, email, or support ticket for unresolved issues.`,
    keywords: ["faq", "questions", "support", "orders", "shipping", "returns"],
  },
  {
    id: "legal-summary",
    title: "Privacy & Terms",
    path: "/privacy",
    category: "legal",
    content: `Privacy Policy and Terms explain data handling, order conditions, returns, and user responsibilities.

For legal questions, contact hello@yourdomain.com.`,
    keywords: ["privacy", "terms", "legal", "data", "policy"],
  },
  {
    id: "checkout-guide",
    title: "Checkout Process",
    path: "/checkout",
    category: "shopping",
    content: `Checkout steps:
1. Add products to cart
2. Enter shipping details
3. Choose delivery method
4. Complete payment
5. Receive confirmation and tracking updates`,
    keywords: ["checkout", "cart", "payment", "delivery", "order"],
  },
];

/**
 * Search the site knowledge base for relevant entries
 */
export function searchSiteKnowledge(query: string, maxResults = 3): SiteKnowledgeEntry[] {
  const lower = query.toLowerCase();
  const words = lower.split(/\s+/).filter(w => w.length > 2);

  const scored = SITE_KNOWLEDGE.map(entry => {
    let score = 0;

    // Exact keyword matches (highest priority)
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) score += 10;
      for (const word of words) {
        if (kw.includes(word) || word.includes(kw)) score += 3;
      }
    }

    // Title match
    if (entry.title.toLowerCase().includes(lower)) score += 15;
    for (const word of words) {
      if (entry.title.toLowerCase().includes(word)) score += 5;
    }

    // Content match
    const contentLower = entry.content.toLowerCase();
    for (const word of words) {
      if (contentLower.includes(word)) score += 2;
    }

    // Boost FAQ entries slightly (they cover common questions)
    if (entry.category === 'faq') score += 1;

    return { entry, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(s => s.entry);
}

/**
 * Get all knowledge entries for a specific category
 */
export function getKnowledgeByCategory(category: string): SiteKnowledgeEntry[] {
  return SITE_KNOWLEDGE.filter(e => e.category === category);
}

/**
 * Build a condensed site map for the system prompt
 */
export function getSiteMapSummary(): string {
  return `WEBSITE PAGES (you can reference these to help customers navigate):
- / — Homepage with featured products, categories, and store info
- /shop — Browse all products with filters (category, price, rating, sort)
- /categories — Shop by category
- /product/[slug] — Individual product pages with details, reviews, variants
- /cart — Shopping cart with coupon support
- /checkout — Checkout flow (shipping → delivery → payment)
- /order-tracking — Track orders by order number + email
- /returns — Start a return request (30-day policy)
- /account — Profile, order history, addresses, security settings
- /wishlist — Saved products
- /about — YOUR_BRAND_NAME story and mission
- /contact — Phone numbers, email, WhatsApp, visit info
- /faqs — 25+ frequently asked questions
- /help — Help center with 50+ articles across 6 categories
- /blog — Shopping tips, product guides, and sourcing insights
- /shipping — Detailed shipping & delivery policy
- /privacy — Privacy policy
- /terms — Terms & conditions
- /support/ticket — Create a support ticket
- /support/tickets — View your tickets
- /auth/login — Sign in
- /auth/signup — Create account
- /auth/forgot-password — Reset password`;
}
