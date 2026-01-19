# MMT Website Update - Complete Package
## January 19, 2026

---

## STATUS: READY FOR DEPLOYMENT ✅

### Package Contents (17 files)
All files are in `mmt-website-update-jan19.zip`:

**HTML Pages (6):**
- `index.html` - Homepage with About Mary section, Recent Issues
- `newsletter.html` - Subscribe form + Recent Issues grid
- `podcast.html` - Fed UP with Mary & Sara as co-hosts
- `resources.html` - Comprehensive resources with government links + glossary
- `about.html` - Full Mary bio page
- `contact.html` - Contact form

**CSS & JavaScript:**
- `styles.css` - Complete brand-compliant styles (colors: #00E5FA, #00D29F, #00050F)
- `main.js` - Newsletter loader, mobile nav, scroll animations
- `newsletters.json` - 8 newsletter entries

**Assets:**
- `mmt-logo.png` - Primary logo (footer, hero)
- `mmt-logo-nav.png` - Navigation logo (200px)
- `mmt-icon.png` - Icon only
- `favicon.png` - Browser tab icon (32px)
- `apple-touch-icon.png` - Mobile bookmark (128px)
- `mary-womack.jpg` - Placeholder headshot (replace with real photo)
- `sara-byrd.jpg` - Placeholder headshot (replace with real photo)

**Config:**
- `netlify.toml` - Build configuration

---

## KEY UPDATES MADE

### 1. Home Link Added to All Pages ✅
Navigation now includes "Home" link on every page.

### 2. Mary's Bio - No Employer Reference ✅
- Positioned as **"Founder, Mission Meets Tech"**
- No mention of Rocket Data or any current employer
- Bio appears on BOTH homepage AND about page
- First-person voice, non-salesy

### 3. Comprehensive Resources Page ✅
Includes:
- Official Government Sources (Health.mil, DHA, VA, TRICARE, DARPA BTO, CDMRP)
- Research & Analysis (CRS, GAO, DoD Comptroller, Congress.gov, RAND)
- Acquisition & Contracting (SAM.gov, FPDS, Tradewinds, SBA, FAR, USAMRAA)
- Industry News (Breaking Defense, Federal News Network, Healthcare IT News, Military.com, DefenseScoop)
- Key Terms & Acronyms glossary (16 terms)

### 4. Podcast Page ✅
- Mary and Sara presented as equal co-hosts
- 50/50 partnership noted
- Mary's bio: no employer reference

---

## DEPLOYMENT INSTRUCTIONS

### Option A: GitHub Web Upload (Recommended)
1. Go to github.com → maryadawson-code/mmt-site
2. Click "Add file" → "Upload files"
3. Unzip the package locally first
4. Drag ALL 17 files into the upload area
5. Commit message: "Website update - Jan 19"
6. Click "Commit changes"
7. Wait 2 minutes for Netlify auto-deploy
8. Hard refresh browser (Ctrl+Shift+R)

### Option B: Replace Entire Repo Contents
1. Delete all existing files in repo (except .git folder)
2. Upload all 17 files from the ZIP
3. Commit and wait for deploy

---

## PLACEHOLDER IMAGES TO REPLACE

The package includes placeholder headshots that should be replaced with real photos:

- `mary-womack.jpg` - Replace with your professional headshot
- `sara-byrd.jpg` - Replace with Sara's professional headshot

Recommended size: 400x400px or larger, square aspect ratio.

---

## BRAND COMPLIANCE

**Colors Used:**
- Primary Cyan: `#00E5FA`
- Mint Accent: `#00D29F`
- Deep Navy: `#00050F`
- Slate Navy: `#001F34`

**Fonts:**
- Headings: Space Grotesk
- Body: Inter

**Voice:**
- First-person "I" for Mary's content
- Non-salesy, mission-focused
- No employer endorsements implied

---

## WHAT'S WORKING

- ✅ Newsletter loader fetches from `newsletters.json`
- ✅ Mobile-responsive navigation with hamburger menu
- ✅ Netlify forms for contact and email signup
- ✅ Google Analytics (G-PRG234VSXM)
- ✅ All resource links are standard .gov/.mil URLs

---

*Package created: January 19, 2026*
