# Mission Meets Tech

![Mission Meets Tech](mmt-logo.png)

**Federal Health IT Intelligence for Decision-Makers**

A professional website and newsletter platform translating complex federal health IT policy into actionable intelligence for government contractors, defense stakeholders, and leaders.

[![Netlify Status](https://api.netlify.com/api/v1/badges/curious-pony-0dec76/deploy-status)](https://app.netlify.com/sites/curious-pony-0dec76/deploys)

---

## 🎯 Overview

Mission Meets Tech provides unfiltered analysis on:
- **Defense Health Agency (DHA)** modernization and MHS GENESIS
- **Veterans Affairs** health system transformation
- **Federal acquisition** strategies and contract vehicles
- **AI/ML implementation** in military healthcare
- **Human Performance Optimization** and combat readiness

### Live Site
**Production:** [https://missionmeetstech.com](https://missionmeetstech.com)

---

## 📁 Project Structure

```
mmt-site/
├── index.html          # Homepage
├── newsletter.html     # Newsletter subscription & recent issues
├── podcast.html        # Fed UP podcast page
├── resources.html      # Curated reference guides
├── about.html          # About Mary Womack
├── contact.html        # Contact form (Netlify Forms)
├── styles.css          # Complete site stylesheet
├── main.js             # Navigation, animations, newsletter loader
├── newsletters.json    # Newsletter issue data
├── netlify.toml        # Netlify deployment configuration
├── mmt-logo.png        # Footer logo
├── mmt-logo-nav.png    # Navigation bar logo
├── mmt-icon.png        # Brand icon
├── favicon.png         # Browser tab icon
├── apple-touch-icon.png # iOS bookmark icon
├── .gitignore          # Git ignore rules
└── README.md           # This file
```

---

## 🚀 Quick Start

### Prerequisites
- Git
- A text editor (VS Code recommended)
- A Netlify account (free tier works)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/maryadawson-code/mmt-site.git
   cd mmt-site
   ```

2. **Local development**
   
   Open `index.html` in your browser, or use a local server:
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Node.js (if you have npx)
   npx serve .
   ```

3. **View the site**
   
   Open [http://localhost:8000](http://localhost:8000) in your browser.

---

## ⚙️ Configuration

### Environment Variables

This is a static site with no server-side secrets required. All configuration is handled through:

| File | Purpose |
|------|---------|
| `netlify.toml` | Deployment settings, redirects, headers |
| `newsletters.json` | Newsletter issue data (edit to add new issues) |

### Netlify Forms

Contact and email signup forms use Netlify's built-in form handling. No additional configuration needed—forms are detected automatically during deployment.

### Google Analytics

Analytics tracking is configured with property ID `G-PRG234VSXM`. To change:
1. Open each HTML file
2. Find the GA4 script tag
3. Replace the measurement ID

---

## 📝 Adding New Newsletter Issues

1. Open `newsletters.json`
2. Add a new entry at the **beginning** of the array:
   ```json
   {
     "title": "Your Newsletter Title",
     "date": "January 20, 2026",
     "description": "Brief description of the issue content...",
     "url": "https://www.linkedin.com/pulse/your-article-url",
     "tags": ["Tag1", "Tag2", "Tag3"]
   }
   ```
3. Commit and push—Netlify will auto-deploy

---

## 🎨 Brand Guidelines

### Colors
| Color | Hex | Usage |
|-------|-----|-------|
| Primary Cyan | `#00E5FA` | Headlines, accents, links |
| Neon Teal | `#00BDAE` | Secondary accent |
| Mint Accent | `#00D29F` | Buttons, highlights |
| Deep Navy | `#00050F` | Background |
| Slate Navy | `#001F34` | Cards, sections |

### Typography
- **Headings:** Space Grotesk (Bold/Semibold)
- **Body:** Inter (Regular/Medium)
- **Fallback:** System sans-serif

### Logo Usage
- Use `mmt-logo-nav.png` for navigation (40px height)
- Use `mmt-logo.png` for footer (50px height)
- Maintain clear space of 0.25× icon width minimum
- Never stretch, skew, or apply heavy effects

---

## 🔧 Deployment

### Automatic (Recommended)
Push to the `main` branch and Netlify deploys automatically.

### Manual
1. Log into [Netlify](https://app.netlify.com)
2. Navigate to the site dashboard
3. Drag and drop the project folder to deploy

### Build Settings (if needed)
- **Build command:** *(none—static site)*
- **Publish directory:** `.`

---

## 🔒 Security Notes

- No API keys or secrets in codebase
- Forms use Netlify's secure form handling
- All external links use `rel="noopener noreferrer"`
- ARIA labels included for accessibility

---

## 📄 License & Disclaimer

### Content Ownership
All newsletter content, analysis, and original writing © 2026 Mary Womack / Mission Meets Tech. All rights reserved.

### AI-Generated Content Disclaimer
Some content on this site may have been drafted or refined with the assistance of AI tools. All published material has been reviewed, edited, and approved by human authors. The views expressed represent the professional analysis of Mission Meets Tech and do not represent the official position of any government agency, contractor, or employer.

### Website Code
The website code structure is available for reference. Brand assets (logos, colors) are proprietary to Mission Meets Tech.

---

## 📞 Contact

**Mary Womack**  
Federal Civilian Account Lead, Rocket Data

- **Website:** [missionmeetstech.com](https://missionmeetstech.com)
- **LinkedIn:** [/in/marydwomack-digitalhealth](https://www.linkedin.com/in/marydwomack-digitalhealth/)
- **Podcast:** [Fed UP: Where Mission Meets Reality](https://podcasts.apple.com/us/podcast/fed-up-where-mission-meets-reality/id1870101530)

---

*Mission. Technology. Transformation.*
