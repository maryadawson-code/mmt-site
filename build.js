const https = require('https');
const fs = require('fs');
const path = require('path');

const RSS_URL = 'https://feeds.transistor.fm/fed-up-where-mission-meets-reality';

// Fetch RSS feed
function fetchRSS(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            let data = '';
            response.on('data', (chunk) => data += chunk);
            response.on('end', () => resolve(data));
            response.on('error', reject);
        }).on('error', reject);
    });
}

// Parse RSS XML (simple parser)
function parseRSS(xml) {
    const episodes = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(xml)) !== null) {
        const item = match[1];
        
        const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || 
                       item.match(/<title>(.*?)<\/title>/) || [])[1] || '';
        
        const description = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                            item.match(/<description>(.*?)<\/description>/) || [])[1] || '';
        
        const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
        
        const enclosure = item.match(/<enclosure[^>]*url="([^"]*)"[^>]*\/?>/) || [];
        const audioUrl = enclosure[1] || '';
        
        const link = (item.match(/<link>(.*?)<\/link>/) || [])[1] || '';
        
        const duration = (item.match(/<itunes:duration>(.*?)<\/itunes:duration>/) || [])[1] || '';
        
        episodes.push({
            title: title.trim(),
            description: cleanDescription(description),
            pubDate: formatDate(pubDate),
            audioUrl,
            link,
            duration
        });
    }
    
    return episodes;
}

// Clean HTML from description
function cleanDescription(html) {
    return html
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim()
        .substring(0, 300) + '...';
}

// Format date
function formatDate(dateStr) {
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch {
        return dateStr;
    }
}

// Generate episode HTML
function generateEpisodeHTML(episode) {
    return `
                <div class="episode-card" data-scroll>
                    <span class="episode-date">${episode.pubDate}</span>
                    <h3>${episode.title}</h3>
                    <p>${episode.description}</p>
                    ${episode.audioUrl ? `
                    <div class="episode-player">
                        <audio controls preload="none">
                            <source src="${episode.audioUrl}" type="audio/mpeg">
                            Your browser does not support the audio element.
                        </audio>
                    </div>
                    ` : ''}
                    ${episode.link ? `<a href="${episode.link}" target="_blank" rel="noopener" class="btn btn-text">View Episode →</a>` : ''}
                </div>`;
}

// Main build function
async function build() {
    console.log('🎙️  Fetching podcast episodes from Transistor...');
    
    try {
        // Fetch and parse RSS
        const rss = await fetchRSS(RSS_URL);
        const episodes = parseRSS(rss);
        
        console.log(`✅ Found ${episodes.length} episodes`);
        
        // Generate episodes HTML
        const episodesHTML = episodes.length > 0 
            ? episodes.map(generateEpisodeHTML).join('\n')
            : '<p class="no-episodes">Episodes coming soon! Subscribe to be notified when we launch.</p>';
        
        // Read template
        const templatePath = path.join(__dirname, 'podcast.template.html');
        let template = fs.readFileSync(templatePath, 'utf8');
        
        // Replace placeholder
        template = template.replace('{{EPISODES}}', episodesHTML);
        
        // Create dist directory
        const distDir = path.join(__dirname, 'dist');
        if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir);
        }
        
        // Write podcast.html
        fs.writeFileSync(path.join(distDir, 'podcast.html'), template);
        console.log('✅ Generated podcast.html');
        
        // Copy all other files to dist
        const filesToCopy = [
            'index.html',
            'about.html',
            'contact.html',
            'newsletter.html',
            'newsletter-archive.html',
            'resources.html',
            'styles.css',
            'main.js',
            'newsletters.json',
            'favicon.svg',
            'favicon.png',
            'apple-touch-icon.png',
            'mmt-logo.png',
            'mmt-logo-nav.png',
            'mary-womack.jpg',
            'sara-byrd.jpg',
            'og-default.png',
            'og-default.svg',
            'og-podcast.svg'
        ];
        
        filesToCopy.forEach(file => {
            const src = path.join(__dirname, file);
            const dest = path.join(distDir, file);
            if (fs.existsSync(src)) {
                fs.copyFileSync(src, dest);
                console.log(`📄 Copied ${file}`);
            }
        });
        
        console.log('🚀 Build complete!');
        
    } catch (error) {
        console.error('❌ Build failed:', error.message);
        
        // Create a fallback podcast page
        const templatePath = path.join(__dirname, 'podcast.template.html');
        let template = fs.readFileSync(templatePath, 'utf8');
        template = template.replace('{{EPISODES}}', '<p class="no-episodes">Episodes coming soon! Subscribe to be notified when we launch.</p>');
        
        const distDir = path.join(__dirname, 'dist');
        if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir);
        }
        
        fs.writeFileSync(path.join(distDir, 'podcast.html'), template);
        console.log('⚠️  Created fallback podcast.html');
        
        // Still copy other files
        const filesToCopy = [
            'index.html', 'about.html', 'contact.html', 'newsletter.html',
            'newsletter-archive.html', 'resources.html', 'styles.css', 'main.js',
            'newsletters.json', 'favicon.svg', 'favicon.png', 'apple-touch-icon.png',
            'mmt-logo.png', 'mmt-logo-nav.png', 'mary-womack.jpg', 'sara-byrd.jpg',
            'og-default.png', 'og-default.svg', 'og-podcast.svg'
        ];
        
        filesToCopy.forEach(file => {
            const src = path.join(__dirname, file);
            const dest = path.join(distDir, file);
            if (fs.existsSync(src)) {
                fs.copyFileSync(src, dest);
            }
        });
    }
}

build();
