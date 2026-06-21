"use client";

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useCMS } from '@/context/CMSContext';
import { supabase } from '@/lib/supabase';
import PageHero from '@/components/PageHero';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useRecaptcha } from '@/hooks/useRecaptcha';

export default function ContactPage() {
  usePageTitle('Contact Us');
  const { getSetting } = useCMS();
  const [pageContent, setPageContent] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { getToken, verifying } = useRecaptcha();

  useEffect(() => {
    async function fetchContactContent() {
      const { data } = await supabase
        .from('cms_content')
        .select('*')
        .eq('section', 'contact')
        .eq('block_key', 'main')
        .single();

      if (data) {
        setPageContent(data);
      }
    }
    fetchContactContent();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('idle');

    const isHuman = await getToken('contact');
    if (!isHuman) {
      setSubmitStatus('error');
      setIsSubmitting(false);
      return;
    }

    try {
      const { error } = await supabase
        .from('contact_submissions')
        .insert({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          subject: formData.subject,
          message: formData.message,
        });

      if (error) {
        console.error('contact_submissions insert error:', error.message);
      }

      fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'contact',
          payload: formData
        })
      }).catch(err => console.error('Contact notification error:', err));

      setSubmitStatus('success');
      setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
    } catch (error) {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const contactEmail = getSetting("contact_email") || "hello@yourdomain.com";
  const contactPhone = getSetting("contact_phone") || "YOUR_PHONE_NUMBER";
  const contactAddress = getSetting("contact_address") || "Accra, Ghana";

  const heroTitle = pageContent?.title || 'Get In Touch';
  const heroSubtitle = pageContent?.subtitle || 'Have a question or need assistance? Our friendly team is here to help.';

  const contactMethods = [
    {
      icon: 'ri-phone-line',
      title: 'Call Us',
      value: contactPhone,
      link: `tel:${contactPhone.replace(/\s/g, '')}`,
      description: "Mon-Sat, 9am-6pm GMT",
    },
    {
      icon: 'ri-mail-line',
      title: 'Email Us',
      value: contactEmail,
      link: `mailto:${contactEmail}`,
      description: 'We respond within 24 hours'
    },
    {
      icon: 'ri-whatsapp-line',
      title: 'WhatsApp',
      value: contactPhone,
      link: `https://wa.me/234${contactPhone.replace(/^0/, '')}`,
      description: 'Chat with us instantly'
    },
    {
      icon: 'ri-map-pin-line',
      title: 'Visit Us',
      value: contactAddress,
      link: 'https://maps.google.com',
      description: "Mon-Sat, 9am-6pm",
    }
  ];

  const faqs = [
    {
      question: 'What are your delivery times?',
      answer: "Worldwide delivery is available. Delivery timelines depend on destination and are confirmed at checkout.",
    },
    {
      question: 'Do you offer international shipping?',
      answer: "Yes. YOUR_BRAND_NAME offers worldwide delivery from Accra, Ghana.",
    },
    {
      question: 'What payment methods do you accept?',
      answer: "We accept secure payment options at checkout, including bank transfers and card payments.",
    },
    {
      question: 'How do I track my order?',
      answer: "After your order ships, you'll receive tracking details via email and SMS. You can also check the Order Tracking page anytime.",
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      <PageHero
        title={heroTitle}
        subtitle={heroSubtitle}
        image="/hero-desktop-2.png"
      />

      {/* Contact Methods */}
      <section className="relative -mt-10 z-10 mb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {contactMethods.map((method, index) => (
              <a
                key={index}
                href={method.link}
                target={method.link.startsWith('http') ? '_blank' : '_self'}
                rel={method.link.startsWith('http') ? 'noopener noreferrer' : ''}
                className="bg-white border border-brand-carton/15 p-5 rounded-2xl hover:shadow-lg hover:border-brand-carton/30 transition-all group"
              >
                <div className="w-11 h-11 bg-brand-carton/10 rounded-xl flex items-center justify-center mb-3 group-hover:bg-brand-carton group-hover:text-white transition-colors">
                  <i className={`${method.icon} text-xl text-brand-brown group-hover:text-white transition-colors`}></i>
                </div>
                <h3 className="font-semibold text-gray-900 text-sm">{method.title}</h3>
                <p className="text-brand-brown font-medium text-sm mt-1">{method.value}</p>
                <p className="text-xs text-gray-500 mt-1">{method.description}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Form + Sidebar */}
      <section className="pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-5 gap-10">

            {/* Form — 3 cols */}
            <div className="lg:col-span-3">
              <div className="bg-white border border-brand-carton/15 rounded-2xl p-6 sm:p-8">
                <p className="text-xs font-semibold tracking-[0.25em] text-brand-carton uppercase mb-1">Send a message</p>
                <h2 className="text-2xl font-extrabold text-gray-900 mb-1">We&apos;d love to hear from you</h2>
                <p className="text-sm text-gray-500 mb-6">Fill out the form and we&apos;ll get back to you within 24 hours.</p>

                <form id="contactForm" onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <label htmlFor="name" className="block text-sm font-semibold text-gray-900 mb-1.5">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-carton/30 focus:border-brand-carton text-sm transition-colors bg-gray-50 focus:bg-white"
                        placeholder="John Doe"
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm font-semibold text-gray-900 mb-1.5">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-carton/30 focus:border-brand-carton text-sm transition-colors bg-gray-50 focus:bg-white"
                        placeholder="john@example.com"
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <label htmlFor="phone" className="block text-sm font-semibold text-gray-900 mb-1.5">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-carton/30 focus:border-brand-carton text-sm transition-colors bg-gray-50 focus:bg-white"
                        placeholder="+233 XX XXXX XXXX"
                      />
                    </div>
                    <div>
                      <label htmlFor="subject" className="block text-sm font-semibold text-gray-900 mb-1.5">
                        Subject *
                      </label>
                      <input
                        type="text"
                        id="subject"
                        name="subject"
                        required
                        value={formData.subject}
                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-carton/30 focus:border-brand-carton text-sm transition-colors bg-gray-50 focus:bg-white"
                        placeholder="Order inquiry, product sourcing, etc."
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-sm font-semibold text-gray-900 mb-1.5">
                      Message *
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      required
                      rows={5}
                      maxLength={500}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-carton/30 focus:border-brand-carton resize-none text-sm transition-colors bg-gray-50 focus:bg-white"
                      placeholder="Tell us how we can help you..."
                    ></textarea>
                    <p className="text-xs text-gray-400 mt-1">{formData.message.length}/500 characters</p>
                  </div>

                  {submitStatus === 'success' && (
                    <div className="bg-brand-cream border border-brand-carton/20 text-brand-brown px-4 py-3 rounded-xl flex items-center gap-2 text-sm">
                      <i className="ri-check-double-line text-lg"></i>
                      Message sent successfully! We&apos;ll respond within 24 hours.
                    </div>
                  )}

                  {submitStatus === 'error' && (
                    <div className="bg-[#FFCCCC]/30 border border-[#FF6666]/20 text-[#9A1900] px-4 py-3 rounded-xl flex items-center gap-2 text-sm">
                      <i className="ri-error-warning-line text-lg"></i>
                      Failed to send message. Please try again or contact us directly.
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting || verifying}
                    className="w-full bg-[#7A5C4D] text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-brand-carton transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isSubmitting || verifying ? (verifying ? 'Verifying...' : 'Sending...') : 'Send Message'}
                  </button>
                </form>
              </div>
            </div>

            {/* Sidebar — 2 cols */}
            <div className="lg:col-span-2 space-y-6">

              {/* FAQs */}
              <div>
                <p className="text-xs font-semibold tracking-[0.25em] text-brand-carton uppercase mb-1">Quick answers</p>
                <h3 className="text-lg font-extrabold text-gray-900 mb-4">Before you reach out</h3>
                <div className="space-y-3">
                  {faqs.map((faq, index) => (
                    <details key={index} className="group bg-brand-cream/40 border border-brand-carton/10 rounded-xl overflow-hidden">
                      <summary className="px-5 py-3.5 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-brand-cream/70 transition-colors flex items-center justify-between">
                        {faq.question}
                        <i className="ri-arrow-down-s-line text-brand-carton/50 group-open:rotate-180 transition-transform"></i>
                      </summary>
                      <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed">
                        {faq.answer}
                      </div>
                    </details>
                  ))}
                </div>
              </div>

              {/* WhatsApp CTA */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#D7A7A0] via-[#8A7750] to-[#7A5C4D] p-6 text-white">
                <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                <div className="relative">
                  <div className="w-11 h-11 bg-white/15 rounded-xl flex items-center justify-center mb-4">
                    <i className="ri-customer-service-2-line text-xl"></i>
                  </div>
                  <h3 className="text-lg font-bold mb-2">Need Immediate Help?</h3>
                  <p className="text-sm text-white/75 mb-5 leading-relaxed">
                    Our team is available Mon-Sat, 9am-6pm GMT. For urgent matters, chat with us on WhatsApp.
                  </p>
                  <a
                    href={`https://wa.me/234${contactPhone.replace(/^0/, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-white text-[#7A5C4D] px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-[#F3F3F3] transition-colors"
                  >
                    <i className="ri-whatsapp-line text-lg"></i>
                    Chat on WhatsApp
                  </a>
                </div>
              </div>

              {/* Visit card */}
              <div className="border border-brand-carton/15 rounded-2xl p-5 bg-brand-cream/30">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 bg-brand-carton/10 rounded-xl flex items-center justify-center shrink-0">
                    <i className="ri-store-2-line text-xl text-brand-brown"></i>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">Visit Our Office</h3>
                    <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                      Stop by in Accra to discuss your sourcing needs in person.
                    </p>
                    <div className="mt-3 space-y-1.5 text-sm text-gray-500">
                      <p className="flex items-center gap-2">
                        <i className="ri-map-pin-2-line text-brand-carton"></i>
                        {contactAddress}
                      </p>
                      <p className="flex items-center gap-2">
                        <i className="ri-time-line text-brand-carton"></i>
                        Mon-Sat: 9am-6pm GMT
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
