// Helper to get favicon URL for a given URL
export const getFaviconUrl = (url: string): string => {
  try {
    const urlObj = new URL(url)
    const domain = urlObj.hostname
    
    // Use Google's favicon service (most reliable)
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  } catch (error) {
    // Fallback if URL is invalid
    return `https://www.google.com/s2/favicons?domain=example.com&sz=32`
  }
}

// Helper to get domain from URL for display
export const getDomain = (url: string): string => {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace('www.', '')
  } catch (error) {
    return url
  }
}


