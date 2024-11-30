import { Devvit, useState, useAsync, useChannel } from '@devvit/public-api';

Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true,
  media: true,
});

Devvit.addCustomPostType({
  name: 'SubWords',
  height: 'tall',
  render: (context) => {
    const channel = useChannel({
      name: 'events',
      onMessage: (data) => {
        // Devvit-specific state update
        if (typeof data === 'object' && data !== null && 'payload' in data) {

          const newGameState = (data.payload as { gameState: any }).gameState;
          setGameState(newGameState);
        }
      },
      onUnsubscribed: () => { },
    });

    channel.subscribe();

    // Load username 
    const [username] = useState(async () => {
      const currUser = await context.reddit.getCurrentUser();
      return currUser?.username ?? 'Guest';
    });

    // Initialize game state from Redis
    const [gameState, setGameState] = useState(async () => {
      const state = await context.redis.get(`subwords:${context.postId}`) || null;
      console.log('Initial Redis State:', state);
      return state ? JSON.parse(state) : {
        cellSelections: {},
        userSelections: {}
      };
    });

    const [webviewVisible, setWebviewVisible] = useState(false);
    const [error, setError] = useState('');

    const onStartGame = () => {
      try {
        setWebviewVisible(true);
        const messageData = { 
          username, 
          postId: context.postId,
          gameState: gameState 
        };
        console.log('Sending to WebView:', messageData);
        context.ui.webView.postMessage('myWebView', {
          type: 'initialData',
          data: JSON.stringify(messageData)
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
              grow
              onMessage={async (message: any) => {
                if (message.type === 'save-state') {
                  const { postId, gameState } = message.data;
                  
                  // Save to Redis
                  console.log('Saving to Redis:', gameState);
                  await context.redis.set(`subwords:${postId}`, JSON.stringify(gameState));
                  
                  // Update local state
                  setGameState(gameState);

                  // Broadcast to real-time channel
                  const realtimeMessage = {
                    payload: { gameState },
                    session: postId,
                  };
                  await channel.send(realtimeMessage);
                }
              }}
            />
          </vstack>
        )}
      </vstack>
    );
  },
});

export default Devvit;