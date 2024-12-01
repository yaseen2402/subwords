import { Devvit, useState, useAsync, useChannel } from '@devvit/public-api';

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
  http: true,
  media: true,
});

Devvit.addCustomPostType({
  name: 'SubWords',
  height: 'tall',
  render: (context) => {
    const channel = useChannel({
      //Valid names can only contain letters, numbers, and underscores (_)
      name: 'game_updates',
      onMessage: (data) => {
        // Handle realtime updates
        if (data && typeof data === 'object' && 'cells' in data) {
          setCells(data.cells as string[]);
        }
      },
    });

    try {
      channel.subscribe();
    } catch (error) {
      console.error('Channel subscription error:', error);
    }


    // Load username 
    const [username] = useState(async () => {
      const currUser = await context.reddit.getCurrentUser();
      return currUser?.username ?? 'anon';
    });

    // Initialize game state from Redis
    const [cells, setCells] = useState(async () => {
      const redisCells = await context.redis.get(`subwords_${context.postId}`) || null;
      // return JSON.parse(redisCells ?? '[]');
      return redisCells ? redisCells.split(',') : []; 
    });

    const [webviewVisible, setWebviewVisible] = useState(false);
    const [error, setError] = useState('');

    const onMessage = async (msg: WebViewMessage) => {
      switch (msg.type) {
        case 'saveCells':
          await context.redis.set(`subwords_${context.postId}`, msg.data.newCells.join(','));
          
          channel.send({
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
      try {
        setWebviewVisible(true);
        console.log('Sending to WebView:');
        context.ui.webView.postMessage('myWebView', {
          type: 'initialData',
          data: {
            username: username,
            currentCells: cells,
          }
        });
      } catch (err) {
        setWebviewVisible(false);
        context.ui.showToast({ text: 'Failed to start game' });
      }
    };

    if (error) {
      return (
        <vstack padding="small" alignment="middle center">
          <text color="red">{error}</text>
        </vstack>
      );
    }

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
          <spacer />
          <button onPress={onStartGame}>Start</button>
        </vstack>
        {webviewVisible && (
          <vstack grow border="thick" borderColor="black">
            <webview
              id="myWebView"
              url="page.html"
              onMessage={(msg)=>onMessage(msg as WebViewMessage)}
              grow
              height={webviewVisible ? '100%' : '0%'}
                
            />
          </vstack>
        )}
      </vstack>
    );
  },
});

export default Devvit;