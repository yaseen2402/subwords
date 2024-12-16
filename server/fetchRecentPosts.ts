import { Context, TriggerContext } from '@devvit/public-api';

export async function fetchRecentPostTitles(context: Context | TriggerContext, subreddit: string) {
  try {
    // Get the current subreddit
    // const subreddit = await context.reddit.getCurrentSubreddit();
    
    // Get new posts from the subreddit using context.reddit
    const posts = await context.reddit.getNewPosts({
      subredditName: subreddit,
      // subredditName: subreddit.name,
      limit: 30
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

export async function useGemini(context: TriggerContext, prompt: string, maxRetries = 3) {
  const baseDelay = 1000; // 1 second initial delay
  const maxDelay = 10000; // Maximum delay of 10 seconds

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const apiKey = await context.settings.get('gemini-api-key');

      if (typeof apiKey !== 'string' || apiKey.trim() === '') {
        throw new Error('Gemini API key is not set or is invalid');
      }

      console.log(`Gemini API Call Attempt ${attempt + 1}`);
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
            maxOutputTokens: 500,
            topK: 40,
            topP: 0.95
          }
        })
      });

      // Retry on network errors or server errors (5xx)
      if (!response.ok) {
        const errorText = await response.text();
        const status = response.status;
        
        // Specific error handling
        if (status === 429) {
          console.warn('Rate limit exceeded. Retrying...');
        } else if (status >= 500) {
          console.warn(`Server error (${status}). Retrying...`);
        } else {
          throw new Error(`Gemini API Error: ${status} - ${errorText}`);
        }

        // Exponential backoff with jitter
        const delay = Math.min(
          baseDelay * Math.pow(2, attempt) + Math.random() * 1000, 
          maxDelay
        );
        
        console.log(`Waiting ${delay}ms before retry`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      const data = await response.json();
      const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      const words = generatedText
        .split(/[,\s]+/)
      
      console.log('Generated Words:', words);
      
      return words.length > 0 ? words : [
        "THE", "OF", "AND", "A", "IN", 
        "TO", "IS", "FOR", "WITH", "BY"
      ];
    } catch (error) {
      console.error(`Gemini Generation Error (Attempt ${attempt + 1}):`, error);
      
      // On last retry, return fallback
      if (attempt === maxRetries) {
        console.error('All retry attempts failed. Using fallback words.');
        return [
          "THE", "OF", "AND", "A", "IN", 
          "TO", "IS", "FOR", "WITH", "BY"
        ];
      }

      // Exponential backoff with jitter for other errors
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt) + Math.random() * 1000, 
        maxDelay
      );
      
      console.log(`Waiting ${delay}ms before retry due to error`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Fallback if somehow loop completes without returning
  console.error('Unexpected failure in Gemini API call');
  return [
    "THE", "OF", "AND", "A", "IN", 
    "TO", "IS", "FOR", "WITH", "BY"
  ];
}

export async function generateWordsFromTitles(context: Context | TriggerContext, titles: string[]): Promise<string[]> {
  const prompt = `
    From these Reddit post titles: ${titles.join(', ')}
    Select 10 words focusing on .
    - **Proper Nouns:** (e.g., names, places)
    - **Unique or evocative words.**

    STRICT RULES:
    - NO numbers
    - NO punctuation
    - NO list markers
    - Words must be UPPERCASE
    - DO NOT include any words that are vulgar, profane, or otherwise inappropriate.
      `;

  console.log('Generating words from titles:', {
    titleCount: titles.length,
    titles: titles
  });

  const generatedWords = await useGemini(context, prompt);

  // Additional filtering and validation
  const processedWords = (generatedWords as string[])
    .map((word: string) => word.trim().toUpperCase())
    

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

  const prompt = `lets play a game where both of us try to form a sentence by taking turns and adding words to the story, currently its your turn, give me a few wor to continue the sentence ${lastWord} 
  
  STRICT RULES:
    - make sure that words you add form a coherent continuation of the exsiting sentence
    - Dont repeat the ${lastWord} in your response
    - Just give me the words to add to ${lastWord}
    - Words must be UPPERCASE
    `
  const connectorWords = await useGemini(context, prompt);
  console.log(connectorWords);  
  

  return connectorWords;
}

export async function CompleteTheStory(context: TriggerContext | Context, lastWord: string): Promise<string[]> {
  

  const prompt = `lets play a game where both of us try to form a sentence by taking turns and adding words to the story, currently its your turn and its final turn so give me a few words to complete the sentence ${lastWord} 
  
  STRICT RULES:
    - Dont repeat the ${lastWord} in your response
    - Just give me the words to add to ${lastWord} to complete the sentence
    - Words must be UPPERCASE
    `
  const connectorWords = await useGemini(context, prompt);
  console.log(connectorWords);  

  return connectorWords;
}

export async function generateFollowUpWords(context: TriggerContext | Context, currentStory: string): Promise<string[]> {
  

  const prompt = `lets play a game where both of us try to form a sentence by taking turns and adding words to the story, currently its my turn, give me a exactly 8 words to choose from to continue the sentence, make sure to give me words with each one leading to potentially different interesting scenarios  ${currentStory}
    STRICT RULES:
    - NO numbers
    - NO punctuation
    - NO list markers
    - Words must be UPPERCASE
  `
  const followUpWords = await useGemini(context, prompt);
  
  const usedWords = currentStory.toUpperCase().split(' ');
  
  const uniqueFollowUpWords = followUpWords.filter((word: string) => 
    word.length >= 1
  );

  return uniqueFollowUpWords;

}
