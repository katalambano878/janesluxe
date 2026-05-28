'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function AdminBlogPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedPosts, setSelectedPosts] = useState<number[]>([]);

  const posts = [
    {
      id: 1,
      title: '10 Essential Tips for Creating a Minimalist Home',
      slug: '10-essential-tips-minimalist-home',
      author: 'Store',
      category: 'Interior Design',
      image: 'https://readdy.ai/api/search-image?query=modern%20minimalist%20living%20room%20interior%20design%20with%20clean%20lines%20natural%20light%20and%20simple%20elegant%20furniture%20in%20neutral%20tones&width=600&height=400&seq=blogadm1&orientation=landscape',
      excerpt: 'Discover how to transform your living space into a serene minimalist haven with these practical tips...',
      status: 'Published',
      views: 2456,
      comments: 23,
      publishDate: 'Dec 15, 2024',
      featured: true
    },
    {
      id: 2,
      title: 'The Art of Choosing Perfect Home Textiles',
      slug: 'art-of-choosing-perfect-home-textiles',
      author: 'Michael Chen',
      category: 'Home Styling',
      image: 'https://readdy.ai/api/search-image?query=luxurious%20home%20textiles%20collection%20with%20cotton%20linens%20throws%20and%20pillows%20in%20natural%20cream%20and%20beige%20tones%20on%20elegant%20display&width=600&height=400&seq=blogadm2&orientation=landscape',
      excerpt: 'Learn the secrets to selecting textiles that elevate your home aesthetic and comfort...',
      status: 'Published',
      views: 1892,
      comments: 18,
      publishDate: 'Dec 10, 2024',
      featured: true
    },
    {
      id: 3,
      title: 'Sustainable Living: Eco-Friendly Home Products Guide',
      slug: 'sustainable-living-eco-friendly-guide',
      author: 'Emma Williams',
      category: 'Sustainability',
      image: 'https://readdy.ai/api/search-image?query=eco-friendly%20sustainable%20home%20products%20including%20natural%20materials%20bamboo%20organic%20cotton%20and%20reusable%20items%20arranged%20aesthetically&width=600&height=400&seq=blogadm3&orientation=landscape',
      excerpt: 'Make conscious choices for your home with our comprehensive guide to sustainable products...',
      status: 'Published',
      views: 3124,
      comments: 31,
      publishDate: 'Dec 5, 2024',
      featured: true
    },
    {
      id: 4,
      title: 'Lighting Design: Creating Ambiance in Every Room',
      slug: 'lighting-design-creating-ambiance',
      author: 'Store',
      category: 'Interior Design',
      image: 'https://readdy.ai/api/search-image?query=elegant%20contemporary%20home%20lighting%20design%20with%20brass%20fixtures%20pendant%20lights%20and%20table%20lamps%20creating%20warm%20ambient%20atmosphere&width=600&height=400&seq=blogadm4&orientation=landscape',
      excerpt: 'Master the art of lighting to transform the mood and functionality of your spaces...',
      status: 'Draft',
      views: 0,
      comments: 0,
      publishDate: 'Dec 25, 2024',
      featured: false
    },
    {
      id: 5,
      title: 'Gift Guide: Thoughtful Home Accessories',
      slug: 'gift-guide-thoughtful-home-accessories',
      author: 'Store',
      category: 'Gift Ideas',
      image: 'https://readdy.ai/api/search-image?query=curated%20collection%20of%20elegant%20home%20accessories%20and%20decor%20items%20beautifully%20arranged%20as%20gift%20ideas%20on%20clean%20white%20background&width=600&height=400&seq=blogadm5&orientation=landscape',
      excerpt: 'Find the perfect gifts for home lovers with our carefully curated selection...',
      status: 'Scheduled',
      views: 0,
      comments: 0,
      publishDate: 'Dec 22, 2024',
      featured: false
    },
    {
      id: 6,
      title: 'Color Psychology: Choosing the Right Palette',
      slug: 'color-psychology-choosing-palette',
      author: 'Michael Chen',
      category: 'Home Styling',
      image: 'https://readdy.ai/api/search-image?query=color%20palette%20swatches%20and%20paint%20samples%20in%20harmonious%20neutral%20and%20earth%20tones%20for%20interior%20design%20inspiration&width=600&height=400&seq=blogadm6&orientation=landscape',
      excerpt: 'Understand how colors affect mood and create the perfect atmosphere in your home...',
      status: 'Published',
      views: 1567,
      comments: 14,
      publishDate: 'Nov 28, 2024',
      featured: false
    }
  ];

  const statusColors: any = {
    'Published': 'bg-gray-100 text-gray-900',
    'Draft': 'bg-gray-100 text-gray-700',
    'Scheduled': 'bg-blue-100 text-blue-700'
  };

  const handleSelectAll = () => {
    if (selectedPosts.length === posts.length) {
      setSelectedPosts([]);
    } else {
      setSelectedPosts(posts.map(p => p.id));
    }
  };

  const handleSelectPost = (postId: number) => {
    if (selectedPosts.includes(postId)) {
      setSelectedPosts(selectedPosts.filter(id => id !== postId));
    } else {
      setSelectedPosts([...selectedPosts, postId]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Blog Posts</h1>
          <p className="text-gray-600 mt-1">Create and manage your blog content</p>
        </div>
        <Link href="/admin/blog/new" className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap">
          <i className="ri-add-line mr-2"></i>
          New Post
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Posts</p>
          <p className="text-2xl font-bold text-gray-900">{posts.length}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Published</p>
          <p className="text-2xl font-bold text-gray-900">{posts.filter(p => p.status === 'Published').length}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Views</p>
          <p className="text-2xl font-bold text-gray-900">{posts.reduce((sum, p) => sum + p.views, 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Comments</p>
          <p className="text-2xl font-bold text-blue-700">{posts.reduce((sum, p) => sum + p.comments, 0)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <select className="px-4 py-2 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 font-medium cursor-pointer">
                <option>All Status</option>
                <option>Published</option>
                <option>Draft</option>
                <option>Scheduled</option>
              </select>
              <select className="px-4 py-2 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 font-medium cursor-pointer">
                <option>All Categories</option>
                <option>Interior Design</option>
                <option>Home Styling</option>
                <option>Sustainability</option>
                <option>Gift Ideas</option>
              </select>
              <select className="px-4 py-2 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 font-medium cursor-pointer">
                <option>Sort by Date</option>
                <option>Sort by Views</option>
                <option>Sort by Comments</option>
              </select>
            </div>
            <div className="flex border-2 border-gray-300 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`w-10 h-10 flex items-center justify-center transition-colors ${
                  viewMode === 'grid' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <i className="ri-grid-line text-xl"></i>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`w-10 h-10 flex items-center justify-center border-l-2 border-gray-300 transition-colors ${
                  viewMode === 'list' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <i className="ri-list-check text-xl"></i>
              </button>
            </div>
          </div>
        </div>

        {selectedPosts.length > 0 && (
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <p className="text-gray-800 font-semibold">
              {selectedPosts.length} post{selectedPosts.length > 1 ? 's' : ''} selected
            </p>
            <div className="flex items-center space-x-2">
              <button className="px-4 py-2 bg-gray-700 hover:bg-gray-900 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap">
                Publish
              </button>
              <button className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap">
                Draft
              </button>
              <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap">
                Delete
              </button>
            </div>
          </div>
        )}

        {viewMode === 'grid' ? (
          <div className="p-6 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <div key={post.id} className="border-2 border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={selectedPosts.includes(post.id)}
                    onChange={() => handleSelectPost(post.id)}
                    className="absolute top-3 left-3 w-5 h-5 text-gray-900 border-gray-300 rounded focus:ring-gray-600 cursor-pointer z-10"
                  />
                  <div className="aspect-video bg-gray-100 overflow-hidden">
                    <img src={post.image} alt={post.title} className="w-full h-full object-cover" />
                  </div>
                  {post.featured && (
                    <span className="absolute top-3 right-3 bg-amber-500 text-white px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap">
                      Featured
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-900">{post.category}</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColors[post.status]}`}>
                      {post.status}
                    </span>
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2 line-clamp-2">{post.title}</h3>
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{post.excerpt}</p>
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-4 pb-4 border-b border-gray-200">
                    <span className="flex items-center">
                      <i className="ri-eye-line mr-1"></i>
                      {post.views}
                    </span>
                    <span className="flex items-center">
                      <i className="ri-chat-3-line mr-1"></i>
                      {post.comments}
                    </span>
                    <span className="whitespace-nowrap">{post.publishDate}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Link
                      href={`/admin/blog/${post.id}`}
                      className="flex-1 bg-gray-900 hover:bg-gray-800 text-white py-2 rounded-lg text-sm font-medium text-center transition-colors whitespace-nowrap"
                    >
                      Edit Post
                    </Link>
                    <button className="w-9 h-9 flex items-center justify-center border-2 border-gray-300 text-gray-700 hover:border-blue-600 hover:text-blue-600 rounded-lg transition-colors">
                      <i className="ri-eye-line"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="py-4 px-6">
                    <input
                      type="checkbox"
                      checked={selectedPosts.length === posts.length}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-600 cursor-pointer"
                    />
                  </th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Post</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Author</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Category</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Views</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Comments</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Status</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6">
                      <input
                        type="checkbox"
                        checked={selectedPosts.includes(post.id)}
                        onChange={() => handleSelectPost(post.id)}
                        className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-600 cursor-pointer"
                      />
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-20 h-14 bg-gray-100 rounded-lg overflow-hidden">
                          <img src={post.image} alt={post.title} className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <Link href={`/admin/blog/${post.id}`} className="font-semibold text-gray-900 hover:text-gray-900">
                            {post.title}
                          </Link>
                          <p className="text-sm text-gray-500 mt-1">{post.publishDate}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-gray-700">{post.author}</td>
                    <td className="py-4 px-4 text-gray-700">{post.category}</td>
                    <td className="py-4 px-4 font-semibold text-gray-900">{post.views}</td>
                    <td className="py-4 px-4 font-semibold text-gray-900">{post.comments}</td>
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusColors[post.status]}`}>
                        {post.status}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-2">
                        <Link
                          href={`/admin/blog/${post.id}`}
                          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <i className="ri-edit-line text-lg"></i>
                        </Link>
                        <button className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors">
                          <i className="ri-eye-line text-lg"></i>
                        </button>
                        <button className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors">
                          <i className="ri-delete-bin-line text-lg"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-6 border-t border-gray-200 flex items-center justify-between">
          <p className="text-gray-600">Showing {posts.length} posts</p>
          <div className="flex items-center space-x-2">
            <button className="w-10 h-10 flex items-center justify-center border-2 border-gray-300 rounded-lg hover:border-gray-400 transition-colors">
              <i className="ri-arrow-left-s-line text-xl text-gray-600"></i>
            </button>
            <button className="w-10 h-10 flex items-center justify-center bg-gray-900 text-white rounded-lg font-semibold">1</button>
            <button className="w-10 h-10 flex items-center justify-center border-2 border-gray-300 rounded-lg hover:border-gray-400 transition-colors">
              <i className="ri-arrow-right-s-line text-xl text-gray-600"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
