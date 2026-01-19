/**
 * Categorize a market question into a category
 */
export function categorizeMarket(
  question: string,
  category?: string
): 'POLITICS' | 'CRYPTO' | 'SPORTS' | 'ENTERTAINMENT' | 'SCIENCE' | 'ECONOMICS' | 'OTHER' {
  const q = question.toLowerCase();

  // Check explicit category first
  if (category) {
    const cat = category.toLowerCase();
    if (cat.includes('politic') || cat.includes('election')) return 'POLITICS';
    if (cat.includes('crypto') || cat.includes('bitcoin') || cat.includes('defi')) return 'CRYPTO';
    if (cat.includes('sport') || cat.includes('nfl') || cat.includes('nba')) return 'SPORTS';
    if (cat.includes('entertainment') || cat.includes('movie') || cat.includes('music'))
      return 'ENTERTAINMENT';
    if (cat.includes('science') || cat.includes('tech')) return 'SCIENCE';
    if (cat.includes('economic') || cat.includes('finance') || cat.includes('stock'))
      return 'ECONOMICS';
  }

  // Pattern matching on question text
  const patterns: Record<string, RegExp[]> = {
    POLITICS: [
      /president/i,
      /election/i,
      /congress/i,
      /senate/i,
      /democrat/i,
      /republican/i,
      /trump/i,
      /biden/i,
      /vote/i,
      /governor/i,
      /mayor/i,
      /primary/i,
      /nomination/i,
      /political/i,
      /cabinet/i,
      /impeach/i,
    ],
    CRYPTO: [
      /bitcoin/i,
      /btc/i,
      /ethereum/i,
      /eth/i,
      /crypto/i,
      /blockchain/i,
      /defi/i,
      /nft/i,
      /token/i,
      /altcoin/i,
      /solana/i,
      /cardano/i,
      /binance/i,
    ],
    SPORTS: [
      /nfl/i,
      /nba/i,
      /mlb/i,
      /nhl/i,
      /soccer/i,
      /football/i,
      /basketball/i,
      /baseball/i,
      /hockey/i,
      /tennis/i,
      /golf/i,
      /super bowl/i,
      /world series/i,
      /championship/i,
      /playoffs/i,
      /mvp/i,
    ],
    ENTERTAINMENT: [
      /oscar/i,
      /grammy/i,
      /emmy/i,
      /movie/i,
      /film/i,
      /album/i,
      /song/i,
      /celebrity/i,
      /actor/i,
      /actress/i,
      /netflix/i,
      /disney/i,
      /box office/i,
    ],
    SCIENCE: [
      /space/i,
      /nasa/i,
      /spacex/i,
      /mars/i,
      /moon/i,
      /climate/i,
      /ai\b/i,
      /artificial intelligence/i,
      /vaccine/i,
      /fda/i,
      /research/i,
      /discovery/i,
    ],
    ECONOMICS: [
      /fed\b/i,
      /federal reserve/i,
      /interest rate/i,
      /inflation/i,
      /gdp/i,
      /recession/i,
      /stock/i,
      /s&p/i,
      /dow/i,
      /nasdaq/i,
      /unemployment/i,
      /treasury/i,
    ],
  };

  for (const [category, regexes] of Object.entries(patterns)) {
    for (const regex of regexes) {
      if (regex.test(q)) {
        return category as
          | 'POLITICS'
          | 'CRYPTO'
          | 'SPORTS'
          | 'ENTERTAINMENT'
          | 'SCIENCE'
          | 'ECONOMICS';
      }
    }
  }

  return 'OTHER';
}

/**
 * Extract keywords from a market question for search
 */
export function extractKeywords(question: string): string[] {
  // Remove common words
  const stopWords = new Set([
    'will',
    'the',
    'be',
    'to',
    'of',
    'in',
    'on',
    'at',
    'for',
    'is',
    'a',
    'an',
    'and',
    'or',
    'by',
    'with',
    'from',
    'as',
    'this',
    'that',
    'it',
    'have',
    'has',
    'been',
    'was',
    'were',
    'are',
    'do',
    'does',
    'did',
    'before',
    'after',
    'during',
  ]);

  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}
