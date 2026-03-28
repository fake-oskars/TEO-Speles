// Analytics Service for tracking user behavior and engagement

export interface AnalyticsEvent {
  event: string;
  [key: string]: unknown;
}

// Helper function to push analytics events using gtag (GA4)
export const pushAnalytics = (eventName: string, payload?: Record<string, unknown>) => {
  try {
    const w: any = window as any;
    
    // Send to gtag (GA4)
    if (typeof w.gtag === 'function') {
      w.gtag('event', eventName, payload);
    }
    
    // Also push to dataLayer for debugging
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event: eventName, ...payload });
    
    console.log('📊 Analytics Event:', eventName, payload); // Debug logging
  } catch (error) {
    console.error('Analytics error:', error);
  }
};

// Page view tracking
export const trackPageView = (pagePath: string, pageTitle: string) => {
  pushAnalytics('page_view', {
    page_path: pagePath,
    page_title: pageTitle,
  });
};

// Screen view tracking (for SPA navigation)
export const trackScreenView = (screenName: string) => {
  // Translate screen names to Latvian
  const readableNames: Record<string, string> = {
    'menu': 'Galvenā izvēlne',
    'name-it': 'Kas tas ir',
    'find-it': 'Atrodi',
    'vroom': 'Brrūm'
  };
  
  pushAnalytics('skats', {
    ekrans: readableNames[screenName] || screenName,
  });
};

// Game session tracking
let gameStartTime: number | null = null;
let currentGameMode: string | null = null;

export const trackGameStart = (gameMode: 'name-it' | 'find-it' | 'vroom', difficulty?: string, itemCount?: number) => {
  gameStartTime = Date.now();
  currentGameMode = gameMode;

  // Translate to Latvian game names
  const gameNames: Record<string, string> = { 'name-it': 'Kas tas ir', 'find-it': 'Atrodi', 'vroom': 'Brrūm' };
  const gameName = gameNames[gameMode] || gameMode;
  const difficultyMap: Record<string, string> = {
    'easy': 'Viegli',
    'medium': 'Vidēji',
    'hard': 'Grūti'
  };
  const difficultyName = difficulty ? difficultyMap[difficulty] : undefined;
  
  pushAnalytics('sakums', {
    spele: gameName,
    grutiba: difficultyName,
    objekti: itemCount,
  });
};

export const trackGameEnd = (stats?: { correct: number; total: number }) => {
  if (!gameStartTime || !currentGameMode) return;
  
  const sessionDuration = Math.round((Date.now() - gameStartTime) / 1000); // in seconds
  const accuracy = stats && stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const gameNames: Record<string, string> = { 'name-it': 'Kas tas ir', 'find-it': 'Atrodi', 'vroom': 'Brrūm' };
  const gameName = gameNames[currentGameMode] || currentGameMode;

  pushAnalytics('beigas', {
    spele: gameName,
    ilgums_sek: sessionDuration,
    pareizi: stats?.correct || 0,
    kopaa: stats?.total || 0,
    precizitate: accuracy,
    value: sessionDuration, // GA4 uses 'value' for metrics
  });
  
  // Reset session tracking
  gameStartTime = null;
  currentGameMode = null;
};

// User interaction tracking
export const trackInteraction = (interactionType: string, details?: Record<string, unknown>) => {
  pushAnalytics('klikskis', {
    emoji: details?.item || 'unknown',
  });
};

// Answer tracking with enhanced metrics
export const trackAnswer = (
  result: 'correct' | 'incorrect',
  item: string,
  gameMode: string,
  responseTime?: number
) => {
  const gameName = gameMode === 'name-it' ? 'Kas tas ir' : 'Atrodi';
  const isCorrect = result === 'correct';
  
  pushAnalytics('atbilde', {
    spele: gameName,
    emoji: item,
    rezultats: result === 'correct' ? 'Pareizi' : 'Nepareizi',
    laiks_ms: responseTime,
    value: isCorrect ? 1 : 0, // 1 for correct, 0 for incorrect
  });
};

// Settings change tracking
export const trackSettingsChange = (setting: string, value: string | number) => {
  // Translate settings to Latvian
  const settingNames: Record<string, string> = {
    'emoji_count': 'Objektu skaits',
    'difficulty': 'Grūtība',
    'language': 'Valoda'
  };
  
  pushAnalytics('iestatijums', {
    iestatijums: settingNames[setting] || setting,
    vertiba: value,
  });
};

// Engagement tracking
export const trackEngagement = (engagementType: string, value?: number | string) => {
  pushAnalytics('engagement', {
    engagement_type: engagementType,
    value,
  });
};

// App initialization tracking
export const trackAppInit = () => {
  const isMobile = window.innerWidth < 768;
  
  pushAnalytics('ieladeja_lapu', {
    ierice: isMobile ? 'Mobilais' : 'Dators',
    platums: window.innerWidth,
    augstums: window.innerHeight,
    valoda: navigator.language,
  });
};
