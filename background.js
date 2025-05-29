// Background script dla Movie Ratings Tooltip
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Otwórz stronę z instrukcjami po instalacji
    chrome.tabs.create({
      url: 'https://www.omdbapi.com/apikey.aspx'
    });
    
    // Pokaż powiadomienie
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon48.png',
      title: 'Movie Ratings Tooltip zainstalowane!',
      message: 'Aby rozpocząć, wprowadź swój klucz API OMDB w ustawieniach rozszerzenia.'
    });
  }
});

// Obsługa komunikatów od content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'testApiKey') {
    testApiKey(request.apiKey).then(result => {
      sendResponse(result);
    });
    return true; // Asynchroniczna odpowiedź
  }
});

async function testApiKey(apiKey) {
  try {
    const response = await fetch(`https://www.omdbapi.com/?t=Inception&apikey=${apiKey}`);
    const data = await response.json();
    
    if (data.Response === 'True') {
      return { success: true, message: 'Klucz API jest poprawny!' };
    } else {
      return { success: false, message: data.Error || 'Niepoprawny klucz API' };
    }
  } catch (error) {
    return { success: false, message: 'Błąd połączenia z API' };
  }
}

// Aktualizuj ikony na podstawie stanu rozszerzenia
chrome.storage.sync.get(['omdbApiKey'], (result) => {
  const hasApiKey = result.omdbApiKey && result.omdbApiKey.length > 0;
  
  chrome.action.setBadgeText({
    text: hasApiKey ? '' : '!'
  });
  
  chrome.action.setBadgeBackgroundColor({
    color: '#ff4444'
  });
  
  chrome.action.setTitle({
    title: hasApiKey ? 'Movie Ratings Tooltip - Aktywny' : 'Movie Ratings Tooltip - Skonfiguruj klucz API'
  });
});

// Nasłuchuj zmian w storage
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.omdbApiKey) {
    const hasApiKey = changes.omdbApiKey.newValue && changes.omdbApiKey.newValue.length > 0;
    
    chrome.action.setBadgeText({
      text: hasApiKey ? '' : '!'
    });
    
    chrome.action.setTitle({
      title: hasApiKey ? 'Movie Ratings Tooltip - Aktywny' : 'Movie Ratings Tooltip - Skonfiguruj klucz API'
    });
  }
});

// Czyść cache co 24 godziny
setInterval(() => {
  chrome.storage.local.clear();
}, 24 * 60 * 60 * 1000);