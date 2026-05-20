// src/app/sitemap.ts
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://tushorarios.com';
  return [
    { url: `${base}/`, lastModified: new Date(), priority: 1.0, changeFrequency: 'weekly' },
    { url: `${base}/login`, lastModified: new Date(), priority: 0.5, changeFrequency: 'yearly' },
  ];
}
