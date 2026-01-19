# Mission Meets Tech

**Federal Health IT Intelligence for Decision-Makers**

A personal brand website and newsletter platform for Mary Womack, translating complex federal health IT policy into actionable intelligence for government contractors, defense stakeholders, and leaders.

## 🌐 Live Site

[https://missionmeetstech.com](https://missionmeetstech.com)

## 📁 Project Structure

```
mmt-site/
├── index.html          # Homepage
├── newsletter.html     # Newsletter subscribe + recent issues
├── podcast.html        # Fed UP podcast page
├── resources.html      # Resource library
├── about.html          # About Mary
├── contact.html        # Contact form
├── styles.css          # All site styling
├── main.js             # Navigation and interactivity
├── newsletters.json    # Newsletter data for Recent Issues
├── netlify.toml        # Netlify configuration
├── mmt-logo.png        # Main logo
├── mmt-logo-nav.png    # Navigation logo
├── favicon.png         # Browser tab icon
└── apple-touch-icon.png # Mobile bookmark icon
```

## 🎨 Brand Colors

| Name | Hex | Usage |
|------|-----|-------|
| Primary Cyan | `#00E5FA` | Headlines, accents, links |
| Neon Teal | `#00BDAE` | Secondary accent |
| Mint Accent | `#00D29F` | Buttons, highlights |
| Deep Navy | `#00050F` | Background |
| Slate Navy | `#001F34` | Cards, sections |

## 🔤 Typography

- **Headings:** Space Grotesk (Bold/Semibold)
- **Body:** Inter (Regular/Medium)

## 🚀 Deployment

This is a static HTML site hosted on Netlify with automatic deploys from GitHub.

**To deploy changes:**
1. Push changes to the `main` branch
2. Netlify automatically builds and deploys
3. Changes are live within 2-3 minutes

## 📊 Analytics

Google Analytics 4 tracking is enabled with property ID: `G-PRG234VSXM`

## 📝 Adding Newsletter Issues

To add a new newsletter issue, edit `newsletters.json`:

```json
{
  "title": "Your Article Title",
  "date": "January 1, 2026",
  "description": "Brief description of the article...",
  "url": "https://www.linkedin.com/pulse/your-article-url",
  "tags": ["Tag1", "Tag2"]
}
```

Add new entries at the beginning of the array (newest first).

## 📧 Forms

Contact and email signup forms are handled by Netlify Forms. Submissions can be viewed in the Netlify dashboard under Forms.

## ⚖️ Disclaimer

The views expressed on this site are my own and do not represent the official position of any organization. This content is for informational purposes only.

---

*Mission. Technology. Transformation.*
