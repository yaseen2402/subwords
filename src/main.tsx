import './createPost.js';

import { Devvit, useState, useChannel} from '@devvit/public-api';
import { 
  fetchRecentPostTitles, 
  generateWordsFromTitles, 
  generateFollowUpWords 
} from '../server/fetchRecentPosts.js';

const MAX_JOBS = 10;
const JOB_LIST_KEY = 'active_job_list';
const MAX_STORY_WORDS = 30;  // Maximum number of words in the story before game ends

type WordData = {
  word: string;
  userCount: number;
};

type WebViewMessage =
  | {
      type: 'initialData';
      data: { 
        username: string; 
        currentCells: WordData[];
        story: string;
      };
    }
  | {
      type: 'saveCells';
      data: { newCells: string[] };
    }
  | {
      type: 'updateGameCells';
      data: { currentCells: string[] };
    }
  | {
      type: 'saveStory';
      data: { story: string };
    }
  | {
      type: 'voteWord';
      data: { word: string };
    };
    
Devvit.configure({
  http: true,
  redditAPI: true,
  realtime: true,
  redis: true,
});

Devvit.addSettings([
  {
    name: 'gemini-api-key',
    label: 'Gemini API Key',
    type: 'string',
    isSecret: true,
    scope: 'app',
  },
]);

function sessionId(): string {
  let id = '';
  const asciiZero = '0'.charCodeAt(0);
  for (let i = 0; i < 4; i++) {
    id += String.fromCharCode(Math.floor(Math.random() * 26) + asciiZero);
  }
  return id;
}

Devvit.addSchedulerJob({
  name: 'CheckMostVotedWord',
  onRun: async (event, context) => {
    console.log('VotedWordCheck job started', {
      postId: event.data?.postId || 'No postId',
      timestamp: new Date().toISOString(),
      fullEventData: JSON.stringify(event)
    });
    
    if (!event.data?.postId) {
      console.error('No postId provided to CheckMostVotedWord job', {
        eventData: JSON.stringify(event),
        contextData: JSON.stringify(context)
      });
      return;
    }

    const postId = event.data.postId;
    const wordVotes: {[word: string]: number} = {};
    const cells = await context.redis.get(`subwords_${postId}`) || '';
    
    console.log('Cells from Redis:', cells, 'for postId:', postId);
    
    if (cells) {
      const words = cells.split(',');
      console.log('Words to check:', words);
      
      for (const word of words) {
        const voteKey = `subwords_${postId}_${word}_votes`;
        const votes = parseInt(await context.redis.get(voteKey) || '0');
        
        console.log(`Detailed vote check for ${word}:`, {
          voteKey: voteKey,
          votes: votes,
          redisValue: await context.redis.get(voteKey)
        });
        
        wordVotes[word] = votes;
      }

      console.log('Detailed Word votes:', JSON.stringify(wordVotes));

      const mostVotedWord = Object.entries(wordVotes)
        .filter(([_, votes]) => votes > 0)
        .sort((a, b) => b[1] - a[1])[0]?.[0];
      
      console.log('Most voted word selection process:', {
        wordVotes: wordVotes,
        mostVotedWord: mostVotedWord
      });

      console.log('Most voted word:', mostVotedWord);

      if (mostVotedWord) {
        const currentStory = await context.redis.get(`subwords_${postId}_story`) || '';
        const updatedStory = `${currentStory} ${mostVotedWord}`.trim();
          
        console.log('Current story:', currentStory);
        console.log('Updated story:', updatedStory);
          
        await context.redis.set(`subwords_${postId}_story`, updatedStory);
          
        // Reset votes for the used word
        await context.redis.set(`subwords_${postId}_${mostVotedWord}_votes`, '0');

        // Remove the used word from current cells
        const currentCellsStr = await context.redis.get(`subwords_${postId}`) || '';
        const currentCells = currentCellsStr.split(',').filter(word => word !== mostVotedWord);

        // Check story length and game status
        const st = updatedStory.split(' ');
        if (st.length >= MAX_STORY_WORDS) {
          await context.redis.set(`subwords_${postId}_game_status`, 'GAME_OVER');
          
          try {
            await context.realtime.send('game_updates', {
              type: 'gameOver',
              story: updatedStory
            });
          } catch (error) {
            console.error('Failed to broadcast game over', error);
          }
          return;
        }

        // Generate ALL new words based on the last added word
        const newFollowUpWords = await generateFollowUpWords(context, mostVotedWord);
        
        // Filter out words already used in the story
        const usedWords = updatedStory.split(' ');
        const availableNewWords = newFollowUpWords.filter(word => 
          !usedWords.includes(word)
        );

        // Create new cells, replacing ALL existing cells
        const newCells = availableNewWords.slice(0, 10).map(word => ({
          word,
          userCount: 0
        }));

        // COMPLETELY replace existing cells in Redis
        await context.redis.set(`subwords_${postId}`, 
          newCells.map(cell => cell.word).join(',')
        );

        // Reset all vote counts for new words
        for (const cell of newCells) {
          await context.redis.set(`subwords_${postId}_${cell.word}_votes`, '0');
          await context.redis.set(`subwords_${postId}_${cell.word}_users`, '0');
        }

        // Broadcast cell update with new words
        try {
          await context.realtime.send('game_updates', {
            type: 'updateCells',
            cells: newCells
          });
        } catch (error) {
          console.error('Failed to broadcast cell update', error);
        }

        // Broadcast story update with more context
        try {
          await context.realtime.send('updateStory', {
            type: 'storyUpdate',
            word: mostVotedWord,
            story: updatedStory
          });
          console.log('Story update broadcasted');
        } catch (realtimeError) {
          console.error('Failed to send realtime event', {
            error: realtimeError,
            message: {
              word: mostVotedWord,
              story: updatedStory
            }
          });

          // Fallback: Use Redis as a backup communication method
          await context.redis.set(`subwords_${postId}_last_story_update`, JSON.stringify({
            word: mostVotedWord,
            story: updatedStory,
            timestamp: new Date().toISOString()
          }));
        }
      } else {
        console.log('No words with votes found');
      }
    } else {
      console.log('No cells found in Redis');
    }
  },
});

Devvit.addTrigger({
  event: 'PostCreate',
  onEvent: async (event, context) => {
    console.log('🚀 PostCreate Trigger Activated', {
      postId: event.post?.id,
      subredditId: event.post?.subredditId
    });

    if (!event.post || !event.post.id) {
      console.error('❌ Invalid post data', { event });
      return;
    }
    
    try {
      // Fetch recent post titles from the same subreddit
      const titles = await fetchRecentPostTitles(context);
      console.log('📜 Fetched Titles:', { 
        count: titles.length, 
        titles: titles.slice(0, 5) // Log first 5 titles
      });

      // Generate initial 10 words
      const initialWords = await generateWordsFromTitles(context, titles);
      console.log('🧩 Generated Initial Words:', initialWords);

      // Store initial words in Redis with vote tracking
      await context.redis.set(`subwords_${event.post.id}`, initialWords.join(','));
      
      // Initialize vote and user tracking for each word
      for (const word of initialWords) {
        await context.redis.set(`subwords_${event.post.id}_${word}_votes`, '0');
        await context.redis.set(`subwords_${event.post.id}_${word}_users`, '0');
      }

      // Initialize story tracking
      await context.redis.set(`subwords_${event.post.id}_story`, '');
      await context.redis.set(`subwords_${event.post.id}_word_count`, '0');

      // Schedule periodic job to check word votes
      const jobId = await context.scheduler.runJob({
        cron: '*/30 * * * * *',
        name: 'CheckMostVotedWord',
        data: { 
          postId: event.post.id,
          createdAt: new Date().toISOString(),
          triggerContext: {
            subredditId: event.post.subredditId,
          }
        },
      });

      console.log('✅ Game Initialization Complete', { 
        postId: event.post.id,
        initialWordCount: initialWords.length,
        jobId 
      });

    } catch (error) {
      console.error('❌ Post Creation Error', { 
        error: error instanceof Error ? error.message : error 
      });
    }
  },
});

Devvit.addCustomPostType({
  name: 'SubWords',
  height: 'tall',
  render: (context) => {
    // Load username 
    const [username] = useState(async () => {
      const currUser = await context.reddit.getCurrentUser();
      return currUser?.username ?? 'anon';
    });

    // Initialize game state from Redis
    const [cells, setCells] = useState(async () => {
      // First, check if words are already in Redis
      const redisCells = await context.redis.get(`subwords_${context.postId}`) || null;
      const allWordsStr = await context.redis.get(`subwords_${context.postId}_all_words`) || '';
      const allWords = allWordsStr ? allWordsStr.split(',') : [];

      if (redisCells) {
        const existingCells = redisCells.split(',');
        const cellsWithCounts: WordData[] = await Promise.all(
          existingCells
            .filter((word: string | undefined): word is string => 
              word !== undefined && word.trim() !== ''
            )
            .map(async (word: string) => {
              const key = `subwords_${context.postId}_${word}_users`;
              const count = parseInt(await context.redis.get(key) || '0');
              return { word, userCount: count };
            })
        );

        // If cells are low, replenish from remaining words
        if (cellsWithCounts.length < 5 && allWords.length > 0) {
          const newWords = allWords.slice(0, 5 - cellsWithCounts.length);
          const newCellsWithCounts = await Promise.all(
            newWords.map(async (word: string) => ({
              word,
              userCount: 0
            }))
          );

          // Update Redis with new words
          const updatedCells = [...existingCells, ...newWords];
          await context.redis.set(`subwords_${context.postId}`, updatedCells.join(','));
          await context.redis.set(`subwords_${context.postId}_all_words`, 
            allWords.slice(5 - cellsWithCounts.length).join(',')
          );

          return [...cellsWithCounts, ...newCellsWithCounts];
        }

        return cellsWithCounts;
      }

      // If no words, generate dynamically
      try {
        const titles = await fetchRecentPostTitles(context);
        const generatedWords = await generateWordsFromTitles(context, titles);
        
        // Take first 10 words
        const initialWords = generatedWords.slice(0, 10);
        
        // Store remaining words in Redis for future use
        await context.redis.set(`subwords_${context.postId}_all_words`, generatedWords.slice(10).join(','));
        await context.redis.set(`subwords_${context.postId}_total_words`, generatedWords.join(','));

        const cellsWithCounts: WordData[] = initialWords
          .filter((word: string | undefined): word is string => 
            word !== undefined && word.trim() !== ''
          )
          .map(word => ({
            word,
            userCount: 0
          }));

        // Store initial words in Redis
        await context.redis.set(`subwords_${context.postId}`, initialWords.join(','));

        // Check if we have enough words
        if (cellsWithCounts.length === 0) {
          // Game over scenario: no more words available
          await context.redis.set(`subwords_${context.postId}_game_status`, 'GAME_OVER');
          return [{ word: 'GAME OVER', userCount: 0 }];
        }

        return cellsWithCounts;
      } catch (error) {
        console.error('Word generation failed, using fallback', error);
        
        // Game over scenario: no words available
        await context.redis.set(`subwords_${context.postId}_game_status`, 'GAME_OVER');
        return [{ word: 'GAME OVER', userCount: 0 }];
      }
    });

    const [story, setStory] = useState(async () => {
      const redisStory = await context.redis.get(`subwords_${context.postId}_story`) || '';
      return redisStory;
    });

    // Set up periodic word voting check
  

    const [webviewVisible, setWebviewVisible] = useState(false);

    const mySession = sessionId();

    const channel2 = useChannel({
      name: 'updateStory',
      onMessage: (data) => {
        // Update local state if needed
        context.ui.webView.postMessage('myWebView', {
          type: 'updateTextField',
          data: data
        });
      },
    });
    
    channel2.subscribe();
    
    const channel = useChannel({
      name: 'game_updates',
      onMessage: (message: any) => {
        console.log('Channel received message:', message);
        
        if (message.session === mySession) {
          console.log('Ignoring own message');
          return;
        }
        
        setCells(message.cells);
        
        // Notify webview of updates
        context.ui.webView.postMessage('myWebView', {
          type: 'updateGameCells',
          data: {
            currentCells: message.cells,
          }
        });
        
        // Ensure the local state is also updated
        setCells(message.cells);
      },
      onSubscribed: () => {
        console.log('Connected to realtime channel');
      },
      onUnsubscribed: () => {
        console.log('Disconnected from realtime channel');
      }
    });


    
    channel.subscribe();
    //receiving messages from webview
    const onMessage = async (msg: any) => {
      switch (msg.type) {
        case 'restartGame':
          // Reset game state
          await context.redis.del(`subwords_${context.postId}`);
          await context.redis.del(`subwords_${context.postId}_all_words`);
          await context.redis.del(`subwords_${context.postId}_story`);
          await context.redis.del(`subwords_${context.postId}_game_status`);

          // Regenerate words
          const titles = await fetchRecentPostTitles(context);
          const generatedWords = await generateWordsFromTitles(context, titles);
          
          const initialWords = generatedWords.slice(0, 10);
          await context.redis.set(`subwords_${context.postId}_all_words`, generatedWords.slice(10).join(','));

          const cellsWithCounts: WordData[] = initialWords
            .filter((word: string | undefined): word is string => 
              word !== undefined && word.trim() !== ''
            )
            .map(word => ({
              word,
              userCount: 0
            }));

          await context.redis.set(`subwords_${context.postId}`, initialWords.join(','));

          // Notify webview with new game state
          context.ui.webView.postMessage('myWebView', {
            type: 'initialData',
            data: {
              username: username,
              currentCells: cellsWithCounts,
              story: '',
            }
          });
          break;
        case 'saveCells':
          // Process only the newly selected cells
          const existingCellsStr = await context.redis.get(`subwords_${context.postId}`) || '';
          const existingCells = existingCellsStr ? existingCellsStr.split(',') : [];

          // Validate that new cells are actually in the current game cells
          const validNewCells = msg.data.newCells.filter((word: string) => 
            existingCells.includes(word)
          );

          const updatedCellsWithCounts: WordData[] = await Promise.all(
            existingCells.map(async (word: string) => {
              const key = `subwords_${context.postId}_${word}_users`;
              const voteKey = `subwords_${context.postId}_${word}_votes`;
              
              const userCount = parseInt(await context.redis.get(key) || '0');
              const voteCount = parseInt(await context.redis.get(voteKey) || '0');
              
              const isNewlySelected = validNewCells.includes(word);
              
              // Only increment if the word is newly selected
              const updatedUserCount = isNewlySelected ? userCount + 1 : userCount;
              const updatedVoteCount = isNewlySelected ? voteCount + 1 : voteCount;
              
              await context.redis.set(key, updatedUserCount.toString());
              await context.redis.set(voteKey, updatedVoteCount.toString());
              
              return { 
                word, 
                userCount: updatedUserCount 
              };
            })
          );

          // Broadcast to all clients
          await channel.send({
            type: 'updateCells',
            session: mySession,
            cells: updatedCellsWithCounts
          });
          
          // Update the state with the new cells
          setCells(updatedCellsWithCounts);

          // Also send to webview for immediate update
          context.ui.webView.postMessage('myWebView', {
            type: 'updateGameCells',
            data: {
              currentCells: updatedCellsWithCounts
            }
          });
          break;
        case 'saveStory':
          const storyText = msg.data.story;
          await context.redis.set(`subwords_${context.postId}_story`, storyText);
          setStory(storyText);
          
          // Broadcast story update to realtime channel
          await channel.send({
            type: 'storyUpdate',
            story: storyText
          });

          // Also send to the updateStory channel for broader compatibility
          await channel2.send({
            type: 'storyUpdate',
            word: storyText,
            story: storyText
          });
          break;
        case 'voteWord':
          const votedWord = msg.data.word;
          const voteKey = `subwords_${context.postId}_${votedWord}_votes`;
          const currentVotes = parseInt(await context.redis.get(voteKey) || '0');
          const newVoteCount = currentVotes + 1;
          await context.redis.set(voteKey, newVoteCount.toString());
          
          console.log('Word voted:', {
            word: votedWord,
            voteKey: voteKey,
            previousVotes: currentVotes,
            newVotes: newVoteCount
          });
          break;
        case 'initialData':
        case 'updateGameCells':
          break;

        default:
          throw new Error(`Unknown message type: ${msg}`);
      }
    };

    const onStartGame = () => {
        console.log('Starting game, subscribing to channel');
        setWebviewVisible(true);
        channel.subscribe();
        console.log('Channel subscribed');
        context.ui.webView.postMessage('myWebView', {
          type: 'initialData',
          data: {
            username: username,
            currentCells: cells,
            story: story,
          }
        });
    };

    return (
      <vstack grow padding="small">
        <vstack
          grow={!webviewVisible}
          height={webviewVisible ? '0%' : '100%'}
          alignment="middle center"
        >
          <text size="xlarge" weight="bold">
            SubWords
          </text>
          <button onPress={onStartGame}>Start</button>
        </vstack>
        <vstack grow={webviewVisible} height={webviewVisible ? '100%' : '0%'}>
          <vstack border="thick" borderColor="black" height={webviewVisible ? '100%' : '0%'}>
            <webview
              id="myWebView"
              url="page.html"
              onMessage={(msg)=>onMessage(msg as WebViewMessage)}
              grow
              height={webviewVisible ? '100%' : '0%'}
            />
          </vstack>
        </vstack>
      </vstack>
    );
  },
});

export default Devvit;
