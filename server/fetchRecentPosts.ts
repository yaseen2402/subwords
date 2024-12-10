import { Context, TriggerContext } from '@devvit/public-api';

export async function fetchRecentPostTitles(context: Context | TriggerContext) {
  try {
    // Get the current subreddit
    const subreddit = await context.reddit.getCurrentSubreddit();
    
    // Get new posts from the subreddit using context.reddit
    const posts = await context.reddit.getNewPosts({
      subredditName: subreddit.name,
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
    // Replace with your actual Gemini API endpoint and key
    const apiKey = await context.settings.get('gemini-api-key');

    if (typeof apiKey !== 'string') {
        throw new Error('Gemini API key is not set or is invalid');
      }
      
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey || ''
      },
      body: JSON.stringify({
        contents: [{ 
          parts: [{ 
            text: prompt 
          }] 
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const generatedText = data.candidates[0].content.parts[0].text;

    // Parse the response into an array of words
    const words = generatedText.split(',')
      .map((word: string) => word.trim().toUpperCase())
      .filter((word: string) => word.length > 2 && word.length < 10);

    console.log('Generated Words from Gemini:', words);
    console.log('Total Generated Words:', words.length);
    console.log('Prompt Used:', prompt);

    return words.slice(0, 100);
  } catch (error) {
    console.error('Error using Gemini:', error);
    
    // Fallback words if generation fails
    const fallbackWords = [
      "APPLE", "BERRY", "CHESS", "DAISY", "EAGLE", 
      "GIANT", "HONEY", "IRONY", "JOKER", "KARMA",
      "LIGHT", "MAGIC", "NOBLE", "OCEAN", "PEACE"
    ];

    console.log('Using Fallback Words:', fallbackWords);
    return fallbackWords;
  }
}

export async function generateWordsFromTitles(context: Context | TriggerContext, titles: string[]): Promise<string[]> {
  const prompt = `
    From these Reddit post titles: ${titles.join(', ')}
    Generate 10 unique, interconnected words that could form a coherent, engaging short story.
    Words should be diverse, evocative, and capable of creating narrative progression.
    Prioritize words that suggest action, emotion, or transformation.
    Provide words as a comma-separated list, all in UPPERCASE.
    Ensure no repetition and aim for words between 4-10 characters.
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

export async function generateFollowUpWords(context: TriggerContext | Context, currentStory: string): Promise<string[]> {
  const prompt = `
    Given the current story context: "${currentStory}", 
    generate 10 unique, interesting follow-up words 
    that could form a cohesive continuation of the narrative. 
    Consider the existing story's tone, themes, and progression.
    Ensure the words are creative, varied in length, and can build narrative depth.
    Provide the words as a comma-separated list, all in UPPERCASE.
    Avoid repeating words already in the story.
    Focus on words that advance the story's plot or reveal character motivations.
  `;

  const followUpWords = await useGemini(context, prompt);
  
  // Filter out words already in the story
  const usedWords = currentStory.toUpperCase().split(' ');
  const uniqueFollowUpWords = followUpWords.filter((word: string) => 
    !usedWords.includes(word)
  );
  
  // Ensure we have at least 10 words, use fallback if needed
  if (uniqueFollowUpWords.length < 10) {
    const fallbackWords = [
      "ADVENTURE", "MYSTERY", "COURAGE", "DREAM", "JOURNEY", 
      "HOPE", "CHALLENGE", "DISCOVERY", "WISDOM", "DESTINY"
    ].filter(word => !usedWords.includes(word));
    
    return [...uniqueFollowUpWords, ...fallbackWords].slice(0, 10);
  }

  return uniqueFollowUpWords.slice(0, 10);
}
