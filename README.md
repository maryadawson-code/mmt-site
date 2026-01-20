# Mission Meets Tech Website

Auto-updating website for Mission Meets Tech newsletter and Fed UP podcast.

**Features:**
- âœ… Auto-updating podcast episodes (Transistor â†’ webhook â†’ rebuild)
- âœ… Newsletter archive (easy-to-update JSON file)
- âœ… Contact form (Netlify Forms - submissions go to email)
- âœ… Email capture (Netlify Forms - collect emails for future use)
- âœ… Google Analytics ready (just add your ID)
- âœ… Social sharing buttons
- âœ… SEO-optimized with Open Graph images
- âœ… Mobile-responsive with hamburger menu

---

## Quick Setup Guide

### Prerequisites
- GitHub account (free): https://github.com
- Netlify account (free): https://netlify.com

**Photos are already included** - Mary and Sara's headshots are in `src/images/`

---

## Step 1: Upload to GitHub

### Option A: Using GitHub.com (Easiest - No Software Needed)

1. Go to https://github.com/new
2. Fill in:
   - **Repository name:** `mmt-site`
   - **Description:** Mission Meets Tech website
   - **Visibility:** Private (recommended) or Public
   - âŒ Do NOT check "Add a README file"
3. Click **Create repository**
4. On the next page, click **"uploading an existing file"** link
5. Drag and drop ALL files from this folder onto the page:
   - `.gitignore`
   - `build.js`
   - `netlify.toml`
   - `package.json`
   - `README.md`
   - `src/` folder (with all files inside)
6. Scroll down, add commit message: "Initial commit"
7. Click **Commit changes**

### Option B: Using GitHub Desktop (Visual App)

1. Download GitHub Desktop: https://desktop.github.com
2. Sign in with your GitHub account
3. File â†’ New Repository
   - Name: `mmt-site`
   - Local path: Choose this folder's location
4. Click **Create Repository**
5. Click **Publish repository** (top right)
6. Uncheck "Keep this code private" if you want it public
7. Click **Publish Repository**

### Option C: Using Terminal (Advanced)

```bash
cd /path/to/this/folder
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/mmt-site.git
git push -u origin main
```

---

## Step 2: Connect Netlify to GitHub

1. Go to https://app.netlify.com
2. Click **Add new site** â†’ **Import an existing project**
3. Click **GitHub**
4. Authorize Netlify to access your GitHub (if prompted)
5. Find and select your `mmt-site` repository
6. Netlify will auto-detect settings from `netlify.toml`:
   - Build command: `npm install && npm run build`
   - Publish directory: `dist`
7. Click **Deploy site**
8. Wait 1-2 minutes for the first build
9. Netlify will give you a URL like `random-name-123.netlify.app`

### Set Your Custom Domain (missionmeetstech.com)

1. In Netlify, go to **Site settings** â†’ **Domain management**
2. Click **Add custom domain**
3. Enter: `missionmeetstech.com`
4. Follow Netlify's DNS instructions (you've already pointed nameservers to Netlify)

---

## Step 3: Create Netlify Build Hook

This creates a URL that triggers a site rebuild when called.

1. In Netlify, go to **Site settings** â†’ **Build & deploy**
2. Scroll down to **Build hooks**
3. Click **Add build hook**
4. Name: `Transistor Episode Published`
5. Branch: `main`
6. Click **Save**
7. **Copy the URL** - it looks like:
   ```
   https://api.netlify.com/build_hooks/abc123xyz789
   ```

**Keep this URL private** - anyone with it can trigger rebuilds.

---

## Step 4: Connect Transistor Webhook

1. Log in to https://dashboard.transistor.fm
2. Select your show: **Fed UP: Where Mission Meets Reality**
3. Go to **Settings** â†’ **Integrations** (or **Webhooks**)
4. Click **Add webhook** or **New webhook**
5. Configure:
   - **URL:** Paste the Netlify build hook URL from Step 4
   - **Event:** Select `episode.published` (or all events)
6. Click **Save**

---

## Step 5: Test It!

1. In Transistor, publish a test episode (you can unpublish it right after)
2. Go to Netlify â†’ **Deploys** tab
3. You should see a new build triggered within seconds
4. Once deployed, check your podcast page - the new episode should appear!

---

## Post-Deployment Configuration

### Google Analytics Setup

1. Go to https://analytics.google.com
2. Create a new property for missionmeetstech.com
3. Copy your Measurement ID (looks like `G-XXXXXXXXXX`)
4. In your GitHub repo, do a find-and-replace:
   - Find: `GA_MEASUREMENT_ID`
   - Replace: Your actual ID (e.g., `G-ABC123XYZ`)
5. Files to update: All HTML files in `src/`
6. Commit and push - Netlify will rebuild

### Contact Form Notifications

Netlify Forms are already configured! To receive submissions:

1. In Netlify: **Site settings** â†’ **Forms**
2. You'll see two forms: `contact` and `email-signup`
3. Click on each form â†’ **Form notifications** â†’ **Add notification**
4. Choose **Email notification** and enter your email
5. Now you'll get an email whenever someone submits!

**View all submissions:** Netlify dashboard â†’ **Forms** tab

### Social Sharing Images (OG Images)

Placeholder images are included. For best results, create custom 1200x630 PNG images:

1. Create these images using your brand:
   - `og-default.png` - General site share image
   - `og-podcast.png` - Podcast page share image  
   - `og-newsletter.png` - Newsletter page share image
   - `og-resources.png` - Resources page share image
   - `og-about.png` - About page share image
2. Add them to `src/images/`
3. Push to GitHub

**Tip:** Use Canva or Figma with your brand colors (Electric Cyan #00F0FF, Voltage Green #00FF85, Deep Void #050505)

---

## Updating Content

### Adding a New Newsletter Issue

Edit `src/data/newsletters.json`:

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

**Important:** New issues go at the TOP of the array (newest first).

### Updating Subscriber Count

When you hit milestones, update in `src/index.html` and `src/newsletter.html`:
- Search for `2,000+` and replace with your new number

---

## How It Works

```
You publish episode in Transistor
           â†“
Transistor sends webhook to Netlify
           â†“
Netlify triggers site rebuild
           â†“
build.js fetches RSS feed from Transistor
           â†“
Podcast page generated with new episodes
           â†“
Site deployed with updated content
```

---

## Updating the Site

### To change content (non-podcast pages):

1. Edit files in `src/` folder
2. Push changes to GitHub
3. Netlify automatically rebuilds

### Using GitHub.com:
1. Go to your repo on github.com
2. Navigate to the file you want to edit
3. Click the pencil icon (Edit)
4. Make changes
5. Click **Commit changes**

### Using GitHub Desktop:
1. Edit files locally
2. Changes appear in GitHub Desktop
3. Add commit message
4. Click **Commit to main**
5. Click **Push origin**

---

## Troubleshooting

### "Build failed" in Netlify
- Check the deploy logs for specific error
- Most common: missing file or typo in code

### Episodes not showing
- Verify RSS feed works: https://feeds.transistor.fm/fed-up-where-mission-meets-reality
- Check Netlify build logs for "Fetching podcast episodes" message

### Webhook not triggering
- Verify build hook URL is correct in Transistor
- Check Transistor webhook delivery logs
- Make sure branch name is `main` in Netlify build hook

---

## File Structure

```
mmt-site/
â”œâ”€â”€ .gitignore           # Tells Git what to ignore
â”œâ”€â”€ build.js             # Fetches RSS, generates podcast page
â”œâ”€â”€ netlify.toml         # Netlify configuration
â”œâ”€â”€ package.json         # Dependencies
â”œâ”€â”€ README.md            # This file
â””â”€â”€ src/                 # Source files
    â”œâ”€â”€ index.html       # Homepage
    â”œâ”€â”€ about.html       # About page
    â”œâ”€â”€ contact.html     # Contact form + email signup
    â”œâ”€â”€ newsletter.html  # Newsletter overview
    â”œâ”€â”€ newsletter-archive.html  # All past issues
    â”œâ”€â”€ podcast.template.html    # Podcast page (auto-updated)
    â”œâ”€â”€ resources.html   # Quick reference guides
    â”œâ”€â”€ styles.css       # All styles
    â”œâ”€â”€ favicon.svg      # Browser tab icon
    â”œâ”€â”€ data/
    â”‚   â””â”€â”€ newsletters.json     # Newsletter archive data (YOU EDIT THIS)
    â””â”€â”€ images/
        â”œâ”€â”€ mary-womack.jpg
        â”œâ”€â”€ sara-byrd.jpg
        â”œâ”€â”€ og-default.svg       # Social share images
        â””â”€â”€ og-podcast.svg
```

---

## Support

Questions? Reach out to Mary on LinkedIn or check Netlify/GitHub documentation:
- Netlify Docs: https://docs.netlify.com
- GitHub Docs: https://docs.github.com

---

## Integration with Your Workflow

### With Taplio (LinkedIn Scheduling)

When scheduling newsletter posts in Taplio:
1. Write your LinkedIn post
2. Include link to the website archive: `missionmeetstech.com/newsletter-archive`
3. After publishing on LinkedIn, update `newsletters.json` with the LinkedIn article URL
4. Push to GitHub â†’ site rebuilds with new archive entry

### Podcast Episode Workflow

1. Record in Riverside.fm
2. Edit and export
3. Upload to Transistor
4. Transistor webhook â†’ Netlify rebuilds â†’ podcast page updates automatically
5. Use Magic Clips to create promo content
6. Schedule promo posts in Taplio

