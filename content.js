// Movie Ratings Tooltip - Content Script
class MovieRatingsTooltip {
  constructor() {
    this.apiKey = '78389e5c'; // Zamień na swój klucz API z OMDB
    this.cache = new Map();
    this.tooltip = null;
    this.currentTarget = null;
    this.debounceTimer = null;
    
    this.init();
  }
  
  init() {
    this.createTooltip();
    this.bindEvents();
    this.loadApiKey();
  }
  
  async loadApiKey() {
    try {
      const result = await chrome.storage.sync.get(['omdbApiKey']);
      if (result.omdbApiKey) {
        this.apiKey = result.omdbApiKey;
        console.log('Załadowano klucz API:', this.apiKey.substring(0, 8) + '...');
      } else {
        console.log('Brak klucza API w storage');
      }
    } catch (error) {
      console.log('Błąd ładowania klucza API:', error);
    }
  }
  
  createTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'movie-ratings-tooltip';
    this.tooltip.style.display = 'none';
    document.body.appendChild(this.tooltip);
  }
  
  bindEvents() {
    document.addEventListener('mouseover', this.handleMouseOver.bind(this));
    document.addEventListener('mouseout', this.handleMouseOut.bind(this));
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    
    // Nasłuchuj wiadomości z popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'apiKeyUpdated') {
        this.apiKey = request.apiKey;
        this.cache.clear(); // Wyczyść cache po zmianie klucza
        console.log('Zaktualizowano klucz API:', this.apiKey.substring(0, 8) + '...');
      }
    });
  }
  
  handleMouseOver(event) {
    const movieElement = this.findMovieElement(event.target);
    if (movieElement && movieElement !== this.currentTarget) {
      this.currentTarget = movieElement;
      
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.showRatings(movieElement, event);
      }, 300);
    }
  }
  
  handleMouseOut(event) {
    if (!event.relatedTarget || !this.tooltip.contains(event.relatedTarget)) {
      clearTimeout(this.debounceTimer);
      this.hideTooltip();
      this.currentTarget = null;
    }
  }
  
  handleMouseMove(event) {
    if (this.tooltip.style.display === 'block') {
      this.positionTooltip(event);
    }
  }
  
  findMovieElement(element) {
    // Szukamy elementów zawierających tytuły filmów/seriali
    const selectors = [
      // Netflix
      '.title-card',
      '.slider-item',
      '.title-card-container',
      
      // HBO Max
      '.content-tile',
      '.tile-link',
      
      // Disney+
      '.content-item',
      
      // Prime Video
      '.av-hover-wrapper',
      '.tst-hover-wrapper',
      
      // YouTube
      '.ytd-rich-item-renderer',
      '.ytd-video-renderer',
      
      // IMDb
      '.titleColumn',
      '.cli-title',
      
      // Ogólne selektory
      '[data-title]',
      '[title]',
      'h1, h2, h3, h4, h5, h6',
      '.movie-title',
      '.film-title',
      '.show-title',
      '.series-title'
    ];
    
    let current = element;
    while (current && current !== document.body) {
      for (const selector of selectors) {
        if (current.matches && current.matches(selector)) {
          return current;
        }
      }
      current = current.parentElement;
    }
    
    return null;
  }
  
  extractMovieTitle(element) {
    // Próbujemy wyciągnąć tytuł filmu z różnych źródeł
    const sources = [
      () => element.getAttribute('data-title'),
      () => element.getAttribute('title'),
      () => element.getAttribute('aria-label'),
      () => element.querySelector('.title')?.textContent,
      () => element.querySelector('h1, h2, h3, h4, h5, h6')?.textContent,
      () => element.textContent
    ];
    
    for (const source of sources) {
      try {
        const title = source();
        if (title && title.trim().length > 0) {
          return this.cleanTitle(title.trim());
        }
      } catch (e) {
        continue;
      }
    }
    
    return null;
  }
  
  cleanTitle(title) {
    // Czyścimy tytuł z niepotrzebnych znaków i informacji
    return title
      .replace(/\s*\(\d{4}\).*$/, '') // Usuń rok i wszystko po nim
      .replace(/\s*-\s*Season\s+\d+.*$/i, '') // Usuń informacje o sezonie
      .replace(/\s*S\d+E\d+.*$/i, '') // Usuń informacje o odcinku
      .replace(/\s*Episode\s+\d+.*$/i, '') // Usuń informacje o odcinku
      .replace(/^\d+\.\s*/, '') // Usuń numery z początku
      .replace(/\s+/g, ' ') // Normalizuj białe znaki
      .trim();
  }
  
  async showRatings(element, event) {
    const title = this.extractMovieTitle(element);
    if (!title || title.length < 2) return;
    
    this.showLoadingTooltip(event);
    
    try {
      const ratings = await this.fetchRatings(title);
      if (ratings) {
        this.displayRatings(ratings, event);
      } else {
        this.hideTooltip();
      }
    } catch (error) {
      console.error('Błąd podczas pobierania ratingów:', error);
      this.hideTooltip();
    }
  }
  
  async fetchRatings(title) {
    const cacheKey = title.toLowerCase();
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    // Sprawdź czy mamy klucz API
    if (!this.apiKey || this.apiKey === 'YOUR_OMDB_API_KEY') {
      console.error('Brak prawidłowego klucza API OMDB');
      return null;
    }
    
    try {
      const url = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${this.apiKey}`;
      console.log('Zapytanie API dla:', title);
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log('Odpowiedź API:', data);
      
      if (data.Response === 'True') {
        const ratings = {
          title: data.Title,
          year: data.Year,
          imdb: data.imdbRating !== 'N/A' ? data.imdbRating : null,
          rottenTomatoes: null,
          metacritic: null,
          poster: data.Poster !== 'N/A' ? data.Poster : null,
          plot: data.Plot !== 'N/A' ? data.Plot : null,
          genre: data.Genre !== 'N/A' ? data.Genre : null,
          director: data.Director !== 'N/A' ? data.Director : null,
          actors: data.Actors !== 'N/A' ? data.Actors : null
        };
        
        // Wyciągamy ratingi z tablicy Ratings
        if (data.Ratings) {
          data.Ratings.forEach(rating => {
            if (rating.Source === 'Rotten Tomatoes') {
              ratings.rottenTomatoes = rating.Value;
            } else if (rating.Source === 'Metacritic') {
              ratings.metacritic = rating.Value;
            }
          });
        }
        
        this.cache.set(cacheKey, ratings);
        return ratings;
      } else {
        console.error('Błąd API OMDB:', data.Error);
        if (data.Error && data.Error.includes('Invalid API key')) {
          console.error('Nieprawidłowy klucz API! Sprawdź ustawienia rozszerzenia.');
        }
      }
    } catch (error) {
      console.error('Błąd sieci:', error);
    }
    
    this.cache.set(cacheKey, null);
    return null;
  }
  
  showLoadingTooltip(event) {
    this.tooltip.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <span>Ładowanie ratingów...</span>
      </div>
    `;
    this.tooltip.style.display = 'block';
    this.positionTooltip(event);
  }
  
  displayRatings(ratings, event) {
    const imdbHtml = ratings.imdb ? 
      `<div class="rating-item imdb">
        <span class="rating-label">IMDb:</span>
        <span class="rating-value">${ratings.imdb}/10</span>
      </div>` : '';
    
    const rtHtml = ratings.rottenTomatoes ? 
      `<div class="rating-item rt">
        <span class="rating-label">Rotten Tomatoes:</span>
        <span class="rating-value">${ratings.rottenTomatoes}</span>
      </div>` : '';
    
    const metacriticHtml = ratings.metacritic ? 
      `<div class="rating-item metacritic">
        <span class="rating-label">Metacritic:</span>
        <span class="rating-value">${ratings.metacritic}</span>
      </div>` : '';
    
    const posterHtml = ratings.poster ? 
      `<div class="poster-container">
        <img src="${ratings.poster}" alt="Poster" class="movie-poster">
      </div>` : '';
    
    const plotHtml = ratings.plot && ratings.plot.length < 200 ? 
      `<div class="plot">${ratings.plot}</div>` : '';
    
    const genreHtml = ratings.genre ? 
      `<div class="genre">Gatunek: ${ratings.genre}</div>` : '';
    
    this.tooltip.innerHTML = `
      <div class="movie-info">
        ${posterHtml}
        <div class="movie-details">
          <div class="movie-title">${ratings.title} (${ratings.year})</div>
          ${genreHtml}
          <div class="ratings">
            ${imdbHtml}
            ${rtHtml}
            ${metacriticHtml}
          </div>
          ${plotHtml}
        </div>
      </div>
    `;
    
    this.tooltip.style.display = 'block';
    this.positionTooltip(event);
  }
  
  positionTooltip(event) {
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let left = event.pageX + 10;
    let top = event.pageY + 10;
    
    // Sprawdź czy tooltip mieści się w prawej stronie
    if (left + tooltipRect.width > viewportWidth) {
      left = event.pageX - tooltipRect.width - 10;
    }
    
    // Sprawdź czy tooltip mieści się w dolnej części
    if (top + tooltipRect.height > viewportHeight + window.scrollY) {
      top = event.pageY - tooltipRect.height - 10;
    }
    
    this.tooltip.style.left = `${Math.max(10, left)}px`;
    this.tooltip.style.top = `${Math.max(10, top)}px`;
  }
  
  hideTooltip() {
    this.tooltip.style.display = 'none';
  }
}

// Uruchom rozszerzenie po załadowaniu strony
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new MovieRatingsTooltip();
  });
} else {
  new MovieRatingsTooltip();
}