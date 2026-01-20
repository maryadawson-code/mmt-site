# Mission Meets Tech - Deployment Package v2.0

## 🚀 Quick Deploy to Netlify

1. **Push to GitHub**: Upload all files to your `missionmeetstech` repository
2. **Netlify will auto-deploy** from the `main` branch using the included `netlify.toml`
3. Done! Your site will be live at missionmeetstech.com

---

## 📁 File Manifest

| File | Purpose |
|------|---------|
| `index.html` | Homepage with video hero |
| `about.html` | Mary + Sara bios (Voice Biography compliant) |
| `podcast.html` | Fed UP podcast with Transistor embed |
| `newsletter.html` | Newsletter signup page |
| `resources.html` | Reference materials, glossary, timeline |
| `styles.css` | Brand stylesheet (#00E5FA, Space Grotesk/Inter) |
| `favicon.svg` | MMT shield favicon |
| `build.js` | Podcast RSS builder (flat structure) |
| `netlify.toml` | Deploy config |
| `package.json` | Dependencies |
| `newsletters.json` | Newsletter archive data |
| `podcast.template.html` | Template for build system |
| `marywomack.jpg` | Mary headshot |
| `sarabyrd.jpg` | Sara headshot |
| `video_intro.mp4` | Hero background video |
| `.gitignore` | Git ignore file |

---

## ✅ Fixes Applied

### Build System
- ✅ Rewrote `build.js` for flat file structure (no `src/` folder)
- ✅ Fixed `netlify.toml` to work with new structure

### Voice Biography Compliance
- ✅ Removed all employer references (no rockITdata, Leidos mentions)
- ✅ Mary bio: "Founder, Mission Meets Tech"
- ✅ Sara bio: "Federal Health IT Veteran & FedHealthIT100 Honoree"

### Brand Compliance
- ✅ Primary cyan: `#00E5FA`
- ✅ Voltage green: `#00FF85`
- ✅ Heading font: Space Grotesk
- ✅ Body font: Inter

### Static Stats Removal
- ✅ Removed all subscriber numbers (1,191+, 59%, 100K+, 1,500+)

### Navigation
- ✅ Unified nav across all pages with Resources link
- ✅ Subscribe CTA button in nav
- ✅ Responsive hamburger menu

### Podcast Links (Verified)
- ✅ Apple: https://podcasts.apple.com/us/podcast/fed-up-where-mission-meets-reality/id1870101530
- ✅ Spotify: https://open.spotify.com/show/7sND342duH7Buw1cUs60lP
- ✅ Amazon: https://music.amazon.com/podcasts/920fec9b-4fae-4bd0-ae4d-eaf1459cad2f
- ✅ YouTube: https://www.youtube.com/channel/UCfuM3t-cm6Kq01lnzYf8KZQ
- ✅ Transistor embed: https://share.transistor.fm/e/fed-up-where-mission-meets-reality

### Video Hero
- ✅ Autoplay, muted, looped playback
- ✅ MMT shield logo overlay
- ✅ Click shield → scroll to subscribe section

### Footer
- ✅ 4-column layout (Brand, Navigate, Listen, Connect)
- ✅ Social icons with hover states
- ✅ All podcast platform links

---

## 🔧 Local Development

```bash
# Install dependencies
npm install

# Build (generates dist/ with podcast RSS)
npm run build

# Preview locally
npx serve dist
```

---

## 📞 Support

Questions? Contact Mary Womack on LinkedIn:
https://www.linkedin.com/in/marydwomack-digitalhealth/
