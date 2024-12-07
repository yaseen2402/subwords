import './createPost.js';

import { Devvit, useState, useChannel} from '@devvit/public-api';

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
      };
    }
  | {
      type: 'saveCells';
      data: { newCells: string[] };
    }
  | {
      type: 'updateGameCells';
      data: { currentCells: string[] };
    };
    
Devvit.configure({
  redditAPI: true,
  realtime: true,
  redis: true,
});

function sessionId(): string {
  let id = '';
  const asciiZero = '0'.charCodeAt(0);
  for (let i = 0; i < 4; i++) {
    id += String.fromCharCode(Math.floor(Math.random() * 26) + asciiZero);
  }
  return id;
}

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
      const redisCells = await context.redis.get(`subwords_${context.postId}`) || null;
      if (!redisCells) return [];
      console.log(redisCells);

      // Fetch user counts for each cell
      const cellsWithCounts: WordData[] = await Promise.all(
        redisCells.split(',').map(async (word) => {
          const key = `subwords_${context.postId}_${word}_users`;
          const count = parseInt(await context.redis.get(key) || '0');
          console.log({word, userCount: count});
          return { word, userCount: count };
        })
      );

      return cellsWithCounts;
    });

    const [webviewVisible, setWebviewVisible] = useState(false);

    const mySession = sessionId();
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

    // const [error, setError] = useState('');

    //receiving messages from webview
    const onMessage = async (msg: any) => {
      switch (msg.type) {
        case 'saveCells':
          // Process only the newly selected cells
          const newCellsWithCounts: WordData[] = await Promise.all(
            msg.data.newCells.map(async (word: string) => {
              const key = `subwords_${context.postId}_${word}_users`;
              const count = parseInt(await context.redis.get(key) || '0');
              
              // Increment count for the new cell
              const updatedCount = count + 1;
              await context.redis.set(key, updatedCount.toString());
              
              console.log("Saving new cell data in Redis:", { 
                key, 
                value: updatedCount, 
                word 
              });
              
              return { word, userCount: updatedCount };
            })
          );

          // Update Redis with the newly selected cells
          const existingCellsStr = await context.redis.get(`subwords_${context.postId}`) || '';
          const existingCells = existingCellsStr ? existingCellsStr.split(',') : [];
          const updatedCellWords = [...new Set([...existingCells, ...msg.data.newCells])];
          
          await context.redis.set(
            `subwords_${context.postId}`, 
            updatedCellWords.join(',')
          );
          
          console.log('Sending message to channel:', {
            session: mySession,
            cells: newCellsWithCounts
          });
          
          await channel.send({
            session: mySession,
            cells: newCellsWithCounts
          });

          console.log('Sent new cells to channel:', newCellsWithCounts);
          
          // Update the state with the new cells
          setCells([...newCellsWithCounts]);
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
