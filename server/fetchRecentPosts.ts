import { Context } from '@devvit/public-api';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

export async function generateWordsFromTitles(titles: string[]): Promise<string[]> {
  try {
    // Use environment variable for API key (you'll need to set this up in Devvit)
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    const model = genAI.getGenerativeModel({ model: "gemini-pro"});

    const prompt = `
      From these Reddit post titles: ${titles.join(', ')}
      Generate a list of 100 unique, interesting words that could form a meaningful story.
      Include words from the titles and add creative, complementary words.
      Provide the words as a comma-separated list, all in UPPERCASE.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse the response into an array of words
    const words = text.split(',')
      .map(word => word.trim().toUpperCase())
      .filter(word => word.length > 2 && word.length < 10);

    return words.slice(0, 100);
  } catch (error) {
    console.error('Error generating words:', error);
    // Fallback words if generation fails
    return [
      "APPLE", "BERRY", "CHESS", "DAISY", "EAGLE", 
      "GIANT", "HONEY", "IRONY", "JOKER", "KARMA",
      "LIGHT", "MAGIC", "NOBLE", "OCEAN", "PEACE"
    ];
  }
}
