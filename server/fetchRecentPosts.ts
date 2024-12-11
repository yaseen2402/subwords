import { Context, Subreddit, TriggerContext } from '@devvit/public-api';

export async function fetchRecentPostTitles(context: Context | TriggerContext) {
  try {
    // Get the current subreddit
    const subreddit = await context.reddit.getCurrentSubreddit();
    
    // Get new posts from the subreddit using context.reddit
    const posts = await context.reddit.getNewPosts({
      subredditName: 'australia',
      // subredditName: subreddit.name,
      limit: 50
    }).all();
    
    // Filter posts from the last 24 hours
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentPosts = posts.filter(post => post.createdAt.getTime() > oneDayAgo);
    
    // Extract titles from recent posts
    const titles = recentPosts.map(post => post.title);
    
    console.log('Recent post titles:', titles);
    return titles;
  } catch (error) {
    console.error('Error fetching recent posts:', error);
    throw error;
  }
}

export async function useGemini(context: TriggerContext, prompt: string) {
  try {
    const apiKey = await context.settings.get('gemini-api-key');

    if (typeof apiKey !== 'string' || apiKey.trim() === '') {
        throw new Error('Gemini API key is not set or is invalid');
    }

    console.log('API Key Status: Key Present');
    console.log('Full Prompt:', prompt);

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ 
          parts: [{ text: prompt }],
          role: 'user'
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 200,
          topK: 40,
          topP: 0.95
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    const words = generatedText
      .split(/[,\s]+/)
      // .map(word => word.trim().toUpperCase())
      // .filter(word => 
      //   word.length >= 2 && 
      //   word.length <= 10 && 
      //   /^[A-Z]+$/.test(word)
      // )
      // .slice(0, 10);

    console.log('Generated Words:', words);
    return words.length > 0 ? words : [
      "THE", "OF", "AND", "A", "IN", 
      "TO", "IS", "FOR", "WITH", "BY"
    ];
  } catch (error) {
    console.error('Gemini Generation Error:', error);
    return [
      "THE", "OF", "AND", "A", "IN", 
      "TO", "IS", "FOR", "WITH", "BY"
    ];
  }
}

export async function generateWordsFromTitles(context: Context | TriggerContext, titles: string[]): Promise<string[]> {
  const prompt = `
    From these Reddit post titles: ${titles.join(', ')}
    Select 10 words focusing on .
    - **Proper Nouns:** (e.g., names, places)
    - **Terms related to fantasy, science fiction, or action.** 
    - **Unique or evocative words.**

    STRICT RULES:
    - NO numbers
    - NO punctuation
    - NO list markers
    - Words must be UPPERCASE
    - There should be atleats 1 article and 1 pronoun in those words.
      `;

  console.log('Generating words from titles:', {
    titleCount: titles.length,
    titles: titles
  });

  const generatedWords = await useGemini(context, prompt);

  // Additional filtering and validation
  const processedWords = generatedWords
    // .map(word => word.trim().toUpperCase())
    // .filter(word => 
    //   word.length >= 4 && 
    //   word.length <= 10 && 
    //   /^[A-Z]+$/.test(word)
    // )
    // .slice(0, 10);

  console.log('Processed words:', {
    originalCount: generatedWords.length,
    processedCount: processedWords.length,
    words: processedWords
  });

  // Fallback mechanism
  if (processedWords.length < 10) {
    const fallbackWords = [
      'DREAM', 'HOPE', 'QUEST', 'SPARK', 'BRAVE', 
      'MAGIC', 'JOURNEY', 'WONDER', 'RISE', 'CHANGE'
    ];
    return [...processedWords, ...fallbackWords].slice(0, 10);
  }

  return processedWords;
}

export async function generateConnectorWords(context: TriggerContext | Context, lastWord: string): Promise<string[]> {
  const prompt = `
    Given the last word "${lastWord}", generate 1-3 connector words.
    These should be articles, prepositions, conjunctions, or helping verbs.
    
    STRICT RULES:
    - NO numbers
    - NO punctuation
    - NO list markers
    - Words must be UPPERCASE
    - Prefer natural, grammatically correct connectors
    - Aim to create a smooth transition in the story
    - If no suitable connectors are found, return an empty array
  `;

  const connectorWords = await useGemini(context, prompt);
  console.log(connectorWords);  
  // Predefined list of valid connectors
  const validConnectors = [
    'IS', 'ARE', 'WAS', 'WERE', 'THE', 'A', 'AN', 
    'OF', 'WITH', 'AND', 'IN', 'TO', 'FOR', 'BY'
  ];

  // Filter and validate connector words
  const processedConnectors = connectorWords.filter((word: string) => 
    validConnectors.includes(word)
  );

  // If no valid connectors found, return a minimal set
  return processedConnectors.length > 0 
    ? processedConnectors.slice(0, 3)
    : ['THE', 'OF', 'AND'].slice(0, 3);
}

export async function generateFollowUpWords(context: TriggerContext | Context, currentStory: string): Promise<string[]> {
  const prompt = `
    Given the current story context: "${currentStory}",
    generate 10 unique, engaging words to continue the narrative.
    
    STRICT RULES:
    - NO numbers
    - NO punctuation
    - NO list markers
    - Words must be UPPERCASE
    - Include diverse word types: nouns, verbs, adjectives
    - Consider story context and potential narrative directions
  `;

  const followUpWords = await useGemini(context, prompt);
  
  const usedWords = currentStory.toUpperCase().split(' ');
  const uniqueFollowUpWords = followUpWords.filter((word: string) => 
    !usedWords.includes(word) && word.length >= 2
  );
  
  const fallbackWords = [
    "ADVENTURE", "MYSTERY", "COURAGE", "DREAM", "JOURNEY", 
    "HOPE", "CHALLENGE", "DISCOVERY", "WISDOM", "DESTINY",
    "EPIC", "QUEST", "MAGIC", "HERO", "LEGEND"
  ];

  const combinedWords = [...new Set([...uniqueFollowUpWords, ...fallbackWords])]
    .filter(word => !usedWords.includes(word))
    .slice(0, 10);

  return combinedWords.length > 0 
    ? combinedWords 
    : fallbackWords.slice(0, 10);
}
