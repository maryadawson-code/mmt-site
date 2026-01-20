const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const RSS_FEED = 'https://feeds.transistor.fm/fed-up-where-mission-meets-reality';

async function build() {
  console.log('🎙️ Fetching podcast episodes from Transistor...');
  
  const parser = new Parser({
    customFields: {
      item: [
        ['itunes:duration', 'duration'],
        ['itunes:image', 'image'],
        ['itunes:episode', 'episodeNumber'],
        ['itunes:season', 'season'],
        ['enclosure', 'enclosure']
      ]
    }
  });

  let feed;
  let hasEpisodes = false;
  
  try {
    feed = await parser.parseURL(RSS_FEED);
    hasEpisodes = feed.items && feed.items.length > 0;
    console.log(`✅ Found ${feed.items.length} episodes`);
  } catch (error) {
    console.error('⚠️ Error fetching RSS feed:', error.message);
    console.log('📝 Using static podcast page instead');
    feed = { items: [], title: 'Fed UP: Where Mission Meets Reality' };
  }

  // Ensure dist directory exists
  const distDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // If we have episodes, generate dynamic podcast page from template
  if (hasEpisodes) {
    // Generate episode cards HTML
    const episodeCards = feed.items.slice(0, 10).map((item, index) => {
      const pubDate = new Date(item.pubDate);
      const formattedDate = pubDate.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
      
      const duration = item.duration || '';
      const episodeNum = item.episodeNumber ? `Episode ${item.episodeNumber}` : '';
      const description = item.contentSnippet || item.content || '';
      const truncatedDesc = description.length > 200 
        ? description.substring(0, 200) + '...' 
        : description;
      
      const isNew = index === 0 ? '<span class="new-badge">NEW</span>' : '';
      
      return `
        <div class="episode-card">
          <div class="episode-header">
            <span class="episode-number">${episodeNum}</span>
            <span class="episode-date">${formattedDate}</span>
            ${isNew}
          </div>
          <h3 class="episode-title">${item.title}</h3>
          <p class="episode-description">${truncatedDesc}</p>
          <div class="episode-footer">
            ${duration ? `<span class="episode-duration"><i class="fas fa-clock"></i> ${formatDuration(duration)}</span>` : ''}
            <a href="${item.link}" class="episode-link" target="_blank" rel="noopener">
              Listen Now <i class="fas fa-external-link-alt"></i>
            </a>
          </div>
        </div>
      `;
    }).join('\n');

    // Generate latest episode hero section
    const latestEpisode = feed.items[0];
    let latestEpisodeHero = '';
    if (latestEpisode) {
      const pubDate = new Date(latestEpisode.pubDate);
      const formattedDate = pubDate.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      latestEpisodeHero = `
        <section class="section section-alt">
          <div class="container">
            <div class="latest-episode-hero">
              <span class="section-label">LATEST EPISODE</span>
              <h2>${latestEpisode.title}</h2>
              <p class="episode-meta">${formattedDate}${latestEpisode.duration ? ` • ${formatDuration(latestEpisode.duration)}` : ''}</p>
              <p class="episode-teaser">${(latestEpisode.contentSnippet || '').substring(0, 300)}...</p>
              <a href="${latestEpisode.link}" class="cta-button" target="_blank" rel="noopener">
                <i class="fas fa-play"></i> Listen to Latest Episode
              </a>
            </div>
          </div>
        </section>
      `;
    }

    // Read template and inject content
    const templatePath = path.join(__dirname, 'src', 'podcast.template.html');
    if (fs.existsSync(templatePath)) {
      let template = fs.readFileSync(templatePath, 'utf8');
      
      template = template.replace('{{EPISODE_CARDS}}', episodeCards || '<p class="no-episodes">No episodes yet. Check back soon!</p>');
      template = template.replace('{{LATEST_EPISODE_HERO}}', latestEpisodeHero);
      template = template.replace('{{LAST_UPDATED}}', new Date().toISOString());
      template = template.replace('{{EPISODE_COUNT}}', feed.items.length.toString());

      fs.writeFileSync(path.join(distDir, 'podcast.html'), template);
      console.log('✅ Generated dynamic podcast.html with episodes');
    }
  } else {
    // No episodes - copy static podcast page
    const staticPodcast = path.join(__dirname, 'src', 'podcast.html');
    if (fs.existsSync(staticPodcast)) {
      fs.copyFileSync(staticPodcast, path.join(distDir, 'podcast.html'));
      console.log('✅ Copied static podcast.html (no episodes found)');
    }
  }

  // Copy all other static files from src to dist
  const staticFiles = [
    'index.html', 
    'about.html', 
    'newsletter.html', 
    'newsletter-archive.html', 
    'resources.html', 
    'styles.css', 
    'favicon.svg'
  ];
  
  staticFiles.forEach(file => {
    const srcPath = path.join(__dirname, 'src', file);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(distDir, file));
      console.log(`✅ Copied ${file}`);
    } else {
      console.warn(`⚠️ Missing file: ${file}`);
    }
  });

  // Copy data folder
  const dataSrc = path.join(__dirname, 'src', 'data');
  const dataDist = path.join(distDir, 'data');
  if (fs.existsSync(dataSrc)) {
    if (!fs.existsSync(dataDist)) {
      fs.mkdirSync(dataDist, { recursive: true });
    }
    fs.readdirSync(dataSrc).forEach(file => {
      fs.copyFileSync(path.join(dataSrc, file), path.join(dataDist, file));
    });
    console.log('✅ Copied data files');
  }

  // Copy images folder
  const imgSrc = path.join(__dirname, 'src', 'images');
  const imgDist = path.join(distDir, 'images');
  if (fs.existsSync(imgSrc)) {
    if (!fs.existsSync(imgDist)) {
      fs.mkdirSync(imgDist, { recursive: true });
    }
    const imgFiles = fs.readdirSync(imgSrc).filter(f => !f.startsWith('.'));
    imgFiles.forEach(file => {
      fs.copyFileSync(path.join(imgSrc, file), path.join(imgDist, file));
    });
    if (imgFiles.length > 0) {
      console.log(`✅ Copied ${imgFiles.length} images`);
    }
  }

  console.log('🎉 Build complete!');
}

function formatDuration(duration) {
  if (!duration) return '';
  
  // If already formatted (HH:MM:SS or MM:SS)
  if (duration.includes(':')) return duration;
  
  // If seconds as a number
  const seconds = parseInt(duration);
  if (isNaN(seconds)) return duration;
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

build().catch(console.error);
