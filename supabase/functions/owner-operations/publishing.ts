// These are publishable keys already shipped by the two public news sites.
// Only published article metadata is read; drafts and contact submissions are excluded.
export const publishingSources = [
  {
    "name": "Civic Records",
    "domain": "civicrecords.it.com",
    "url": "https://kwyxkmozyynzfaouaeuj.supabase.co",
    "key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3eXhrbW96eXluemZhb3VhZXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MjI5NTEsImV4cCI6MjA4NTA5ODk1MX0.8Ttm7J7LJGAZpYEubzLiyVT-x-zWOwJRKEzPm67hpc0",
    "dateColumn": "published_at",
    "publishedFilter": null,
    "articlePath": "/article/"
  },
  {
    "name": "Data Research",
    "domain": "dataresearch.blog",
    "url": "https://avptihtpmjviqqkjsnkh.supabase.co",
    "key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2cHRpaHRwbWp2aXFxa2pzbmtoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MDEzMzUsImV4cCI6MjA4NTE3NzMzNX0.zfQCi1SWFIofd9x6FucrWfbBeC0Q7bxsRvyEObIMO_w",
    "dateColumn": "publish_date",
    "publishedFilter": "is_published",
    "articlePath": "/research/"
  }
];
