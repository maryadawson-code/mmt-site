# Mission Meets Tech Website

Auto-updating website for Mission Meets Tech newsletter and Fed UP podcast.

**Features:**
- ✅ Auto-updating podcast episodes (Transistor → webhook → rebuild)
- ✅ Newsletter archive (easy-to-update JSON file)
- ✅ Contact form (Netlify Forms - submissions go to email)
- ✅ Email capture (Netlify Forms - collect emails for future use)
- ✅ Google Analytics ready (G-PRG234VSXM)
- ✅ Social sharing buttons
- ✅ SEO-optimized with Open Graph images
- ✅ Mobile-responsive with hamburger menu
- ✅ Legal disclaimers on all pages

---

## How to Update Your Site

### To Upload These Files to GitHub:

1. Go to your repo: https://github.com/maryadawson-code/mmt-site
2. Click each file and use the pencil icon to edit, OR
3. Delete existing files and drag-drop these new ones

### Files to Replace:
- `index.html` - Updated hero section (Option A)
- `about.html` - Your new About page with positioning
- `contact.html` - Contact form with disclaimer
- `newsletter.html` - Newsletter page with disclaimer
- `newsletter-archive.html` - Archive with search/filter
- `resources.html` - Quick reference tables
- `podcast.template.html` - Template for auto-generated podcast page
- `styles.css` - Complete styles including disclaimers
- `main.js` - Navigation and scroll animations
- `newsletters.json` - Your newsletter archive data
- `build.js` - Builds podcast page from RSS
- `netlify.toml` - Netlify configuration
- `package.json` - Node.js configuration
- `.gitignore` - Git ignore file

### Keep Your Existing:
- `mary-womack.jpg`
- `sara-byrd.jpg`
- `mmt-logo.png`
- `mmt-logo-nav.png`
- `favicon.svg`
- `favicon.png`
- `apple-touch-icon.png`
- `og-default.png`
- `og-default.svg`
- `og-podcast.svg`

---

## Adding New Newsletter Issues

Edit `newsletters.json` - add new issues at the TOP:

```json
[
  {
    "title": "Your New Issue Title",
    "date": "January 25, 2026",
    "description": "Brief description of what this issue covers...",
    "url": "https://www.linkedin.com/pulse/your-article-url",
    "tags": ["Tag1", "Tag2", "Tag3"]
  },
  // ... existing issues below
]
```

---

## How It Works

```
You publish episode in Transistor
           ↓
Transistor sends webhook to Netlify
           ↓
Netlify triggers site rebuild
           ↓
build.js fetches RSS feed from Transistor
           ↓
Podcast page generated with new episodes
           ↓
Site deployed with updated content
```

---

## Legal Disclaimer (on all pages)

> The views and opinions expressed on this site are my own and do not represent the official position of my employer, any government agency, or any other organization. Content is for informational purposes only and does not constitute legal, financial, or medical advice.

---

## Support

Questions? Reach out to Mary on LinkedIn or check:
- Netlify Docs: https://docs.netlify.com
- GitHub Docs: https://docs.github.com
