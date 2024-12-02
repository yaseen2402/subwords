import './createPost.js';

import { Devvit, useState, useChannel} from '@devvit/public-api';

interface GameMessage {
  cells: string[];
  session: string;
}

type WebViewMessage =
  | {
      type: 'initialData';
      data: { username: string; currentCells: string[] };
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

interface Payload {
  type: string,
  payload?: any,
  session: string,
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
      return redisCells ? redisCells.split(',') : []; 
    });

    const [webviewVisible, setWebviewVisible] = useState(false);

    const mySession = sessionId();
    const channel = useChannel({
      name: 'game_updates',
      onMessage: (message: GameMessage) => {
        if (message.session === mySession) return;
        
        setCells(message.cells);
        
        // Notify webview of updates
        context.ui.webView.postMessage('myWebView', {
          type: 'devvit-message',
          data: {
            message: {
              type: 'updateGameCells', 
              data: { currentCells: message.cells }
            }
          }
        });
      },
      onSubscribed: () => {
        console.log('Connected to realtime channel');
      },
      onUnsubscribed: () => {
        console.log('Disconnected from realtime channel');
      }
    });

    // const [error, setError] = useState('');

    const onMessage = async (msg: WebViewMessage) => {
      switch (msg.type) {
        case 'saveCells':
          await context.redis.set(`subwords_${context.postId}`, msg.data.newCells.join(','));
          
          await channel.send({
            session: mySession,
            cells: msg.data.newCells
          });
          
          context.ui.webView.postMessage('myWebView', {
            type: 'updateGameCells',
            data: {
              currentCells: msg.data.newCells,
            },
          });
          setCells(msg.data.newCells);
          break;
        case 'initialData':
        case 'updateGameCells':
          break;

        default:
          throw new Error(`Unknown message type: ${msg satisfies never}`);
      }
    };

    const onStartGame = () => {
        setWebviewVisible(true);
        channel.subscribe();
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
