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
    // Replace with your actual Gemini API endpoint and key
    const apiKey = await context.settings.get('gemini-api-key');

    if (typeof apiKey !== 'string') {
        throw new Error('Gemini API key is not set or is invalid');
    }
      
    console.log('API Key Status:', apiKey ? 'Key Present' : 'Key Missing');
    console.log('Full Prompt:', prompt);

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', {
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
        }],
        generationConfig: {
          temperature: 1,
          maxOutputTokens: 200
        }
      })
    });

    console.log('Response Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Full Error Response:', errorText);
      throw new Error(`HTTP error! status: ${response.status}, ${errorText}`);
    }

    const data = await response.json();
    console.log('Full API Response:', JSON.stringify(data, null, 2));

    // More robust parsing of Gemini response
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    console.log('Raw Generated Text:', generatedText);

    const words = generatedText
      .split(/[,\s]+/)  // Split on comma or whitespace
      .map((word: string) => word.trim().toUpperCase())
      .filter((word: string) => 
        word.length >= 4 && 
        word.length <= 10 && 
        !/^\d+$/.test(word) &&  // Exclude pure numbers
        !/^[.,:()[\]"']/.test(word) &&  // Exclude punctuation and markers
        !/^[A-Z]\./.test(word) &&  // Exclude numbered list markers
        /^[A-Z]+$/.test(word)  // Ensure only alphabetic characters
      )
      .slice(0, 10);  // Limit to 10 words

    console.log('Generated Words from Gemini:', words);
    console.log('Total Generated Words:', words.length);

    return words.length > 0 ? words.slice(0, 10) : [
      "THE", "CEO", "CHESS", "BAD", "AN", 
      "TO", "HONEY", "SHOT", "OF", "KARMA"
    ];
  } catch (error) {
    console.error('Comprehensive Gemini Error:', {
      errorName: error instanceof Error ? error.name : 'Unknown Error',
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : 'No stack trace'
    });
    
    // Fallback words if generation fails
    const fallbackWords = [
      "THE", "CEO", "CHESS", "BAD", "AN", 
      "TO", "HONEY", "SHOT", "OF", "KARMA",
      "A", "NOT", "NOBLE", "GOOD", "PEACE"
    ];

    console.log('Using Fallback Words:', fallbackWords);
    return fallbackWords;
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

export async function generateFollowUpWords(context: TriggerContext | Context, currentStory: string): Promise<string[]> {
  const prompt = `
    Given the current story context: "${currentStory}",
     provide a list of 10 words (including prepositions, articles, verbs, nouns, adjectives, etc.) that can be used to continue the phrase "${currentStory}"  
     STRICT RULES:
    - NO numbers
    - NO punctuation
    - NO list markers
    - Words must be UPPERCASE
    - Ensure words can contribute to an engaging narrative
    - If applicable, consider words related to characters, settings, or plot elements from the story context.
    - There should be atleast one article and one preposition in the words you return 
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
