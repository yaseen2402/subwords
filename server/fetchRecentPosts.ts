import { Context, TriggerContext } from '@devvit/public-api';

export async function fetchRecentPostTitles(context: Context) {
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

export async function generateWordsFromTitles(context: Context, titles: string[]): Promise<string[]> {
  const prompt = `
    From these Reddit post titles: ${titles.join(', ')}
    Generate a list of 100 unique, interesting words that could form a meaningful story.
    Include words from the titles and add creative, complementary words.
    Provide the words as a comma-separated list, all in UPPERCASE.
  `;

  return await useGemini(context, prompt);
}

export async function generateFollowUpWords(context: Context, previousWord: string): Promise<string[]> {
  const prompt = `
    Given the word "${previousWord}", generate 10 unique, interesting follow-up words 
    that could form a cohesive sentence or continue an engaging story. 
    Ensure the words are creative, varied in length, and can be used to build narrative tension.
    Provide the words as a comma-separated list, all in UPPERCASE.
    Avoid repeating the previous word.
  `;

  const followUpWords = await useGemini(context, prompt);
  
  // Ensure we have at least 10 words, use fallback if needed
  if (followUpWords.length < 10) {
    const fallbackWords = [
      "ADVENTURE", "MYSTERY", "COURAGE", "DREAM", "JOURNEY", 
      "HOPE", "CHALLENGE", "DISCOVERY", "WISDOM", "DESTINY"
    ];
    return [...followUpWords, ...fallbackWords].slice(0, 10);
  }

  return followUpWords.slice(0, 10);
}
