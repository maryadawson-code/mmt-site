# MMT Website Update - QA/QC Fixed Version
## January 19, 2026

---

## STATUS: READY FOR DEPLOYMENT ✅

Use **`mmt-website-QA-fixed-jan19.zip`** (this is the corrected version)

---

## QA/QC FIXES APPLIED

The following issues were identified and fixed in this version:

### CSS Fixes:
1. **Issue cards as links** - Added `display: block` and proper text color inheritance so newsletter cards display correctly when rendered as `<a>` tags
2. **Missing `.features` section class** - Added background styling
3. **Missing `.recent-issues` section class** - Added background styling
4. **Missing `.about-content-section` class** - Added background styling
5. **Missing `.footer-brand` class** - Added display block styling
6. **Missing `.about-preview-image-container` class** - Added flexbox centering
7. **Fixed issue card text colors** - Added proper `font-family`, `line-height`, and explicit colors for `.issue-title` and `.issue-description` so they don't inherit link cyan color
8. **Added responsive breakpoint** for issues grid at 400px mobile screens

### Validation Results:
- ✅ All 6 HTML files: Tags balanced
- ✅ CSS: 157 braces balanced, no syntax errors
- ✅ JSON: Valid with 8 newsletter entries
- ✅ All HTML classes now have corresponding CSS definitions
- ✅ All file references (images, CSS, JS) verified present

---

## PACKAGE CONTENTS (17 files)

**HTML Pages (6):**
- `index.html` - Homepage with About Mary section, Recent Issues
- `newsletter.html` - Subscribe form + Recent Issues grid
- `podcast.html` - Fed UP with Mary & Sara as co-hosts
- `resources.html` - Comprehensive resources with government links + glossary
- `about.html` - Full Mary bio page
- `contact.html` - Contact form

**CSS & JavaScript:**
- `styles.css` - Complete brand-compliant styles (15KB, all classes defined)
- `main.js` - Newsletter loader, mobile nav, scroll animations
- `newsletters.json` - 8 newsletter entries

**Assets:**
- `mmt-logo.png` - Primary logo (footer, hero)
- `mmt-logo-nav.png` - Navigation logo (200px)
- `mmt-icon.png` - Icon only
- `favicon.png` - Browser tab icon (32px)
- `apple-touch-icon.png` - Mobile bookmark (128px)
- `mary-womack.jpg` - Placeholder headshot (REPLACE with real photo)
- `sara-byrd.jpg` - Placeholder headshot (REPLACE with real photo)

**Config:**
- `netlify.toml` - Build configuration

---

## DEPLOYMENT INSTRUCTIONS

### Option A: GitHub Web Upload (Recommended)
1. Go to github.com → maryadawson-code/mmt-site
2. Click "Add file" → "Upload files"
3. **Unzip `mmt-website-QA-fixed-jan19.zip` locally first**
4. Drag ALL 17 files into the upload area
5. Commit message: "Website update - Jan 19 QA fixes"
6. Click "Commit changes"
7. Wait 2 minutes for Netlify auto-deploy
8. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)

### Option B: Replace Entire Repo Contents
1. Delete all existing files in repo (keep .git folder if using git locally)
2. Upload all 17 files from the ZIP
3. Commit and wait for deploy

---

## PLACEHOLDER IMAGES TO REPLACE

The package includes placeholder headshots that should be replaced:

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
- Mary positioned as "Founder, Mission Meets Tech"

---

## KEY FEATURES

- ✅ Home link on ALL pages
- ✅ Newsletter loader fetches from `newsletters.json`
- ✅ Mobile-responsive navigation with hamburger menu
- ✅ Netlify forms for contact and email signup
- ✅ Google Analytics (G-PRG234VSXM)
- ✅ Mary's bio on homepage AND about page (no employer)
- ✅ Comprehensive resources page with government links
- ✅ 16-term glossary of federal health IT acronyms
- ✅ Podcast page with Sara as equal co-host (50/50)

---

*Package created: January 19, 2026*
*QA/QC fixes applied: January 19, 2026*
