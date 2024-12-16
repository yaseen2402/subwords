import "./createPost.js";

import { Devvit, useState, useChannel, Subreddit } from "@devvit/public-api";
import {
  fetchRecentPostTitles,
  generateWordsFromTitles,
  generateFollowUpWords,
  generateConnectorWords,
  CompleteTheStory,
} from "../server/fetchRecentPosts.js";

const MAX_JOBS = 5;
const JOB_LIST_KEY = "active_job_list";
const MAX_ROUNDS = 6;

type WordData = {
  word: string;
  userCount: number;
};

type WebViewMessage =
  | {
      type: "initialData";
      data: {
        username: string;
        currentCells: WordData[];
        story: string;
        gameRound: number;
        timeRemaining: number;
        fontUrl: string;
        timerUrl: string;
        subreddit: string;
      };
    }
  | {
      type: "saveCells";
      data: { newCells: string[] };
    }
  | {
      type: "updateGameCells";
      data: { currentCells: string[] };
    }
  | {
      type: "updateGameRound";
      data: { gameRound: number };
    }
  | {
      type: "saveStory";
      data: { story: string };
    }
  | {
      type: "voteWord";
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
    name: "gemini-api-key",
    label: "Gemini API Key",
    type: "string",
    isSecret: true,
    scope: "app",
  },
]);

function sessionId(): string {
  let id = "";
  const asciiZero = "0".charCodeAt(0);
  for (let i = 0; i < 4; i++) {
    id += String.fromCharCode(Math.floor(Math.random() * 26) + asciiZero);
  }
  return id;
}

Devvit.addSchedulerJob({
  name: "CheckMostVotedWord",
  onRun: async (event, context) => {
    await context.redis.set(
      `subwords_${context.postId}_${context.reddit.getCurrentUser()}_canVote`,
      "true",
      {
        expiration: new Date(Date.now() + 86400000), // 24 hours from now
      }
    );
    if (!event.data?.postId) {
      console.error("No postId provided to CheckMostVotedWord job", {
        eventData: JSON.stringify(event),
        contextData: JSON.stringify(context),
      });
      return;
    }

    const username = await context.reddit.getCurrentUser();
    const postId = event.data.postId;
    const wordVotes: { [word: string]: number } = {};
    const cells = (await context.redis.get(`subwords_${postId}`)) || "";

    console.log(`set vote value true for username: ${username}`);

    if (cells) {
      const words = cells.split(",");
      // console.log('Words to check:', words);

      for (const word of words) {
        const voteKey = `subwords_${postId}_${word}_votes`;
        const votes = parseInt((await context.redis.get(voteKey)) || "0");

        // console.log(`Detailed vote check for ${word}:`, {
        //   voteKey: voteKey,
        //   votes: votes,
        //   redisValue: await context.redis.get(voteKey)
        // });

        wordVotes[word] = votes;
      }

      // console.log('Detailed Word votes:', JSON.stringify(wordVotes));

      const mostVotedWord = Object.entries(wordVotes)
        .filter(([_, votes]) => votes > 0)
        .sort((a, b) => b[1] - a[1])[0]?.[0];

      // console.log('Most voted word selection process:', {
      //   wordVotes: wordVotes,
      //   mostVotedWord: mostVotedWord,
      //   postId: event.data?.postId
      // });

      if (mostVotedWord) {
        // console.log('Detailed Word Processing:', {
        //   mostVotedWord: mostVotedWord,
        //   currentStory: await context.redis.get(`subwords_${postId}_story`) || 'No Story',
        //   currentCells: await context.redis.get(`subwords_${postId}`) || 'No Cells'
        // });
        const currentStory =
          (await context.redis.get(`subwords_${postId}_story`)) || "";
        const initialStory = `${currentStory} ${mostVotedWord}`.trim();

        console.log("Current story:", currentStory);
        console.log("Updated story:", initialStory);

        await context.redis.set(`subwords_${postId}_story`, initialStory);

        // Reset votes for the used word
        await context.redis.set(
          `subwords_${postId}_${mostVotedWord}_votes`,
          "0",
          {
            expiration: new Date(Date.now() + 86400000), // 24 hours from now
          }
        );

        const gameRoundKey = `subwords_${postId}_game_round`;

        // Ensure game round is initialized to 1 if not set
        const currentRound = parseInt(
          (await context.redis.get(gameRoundKey)) || "1"
        );

        const newRound = currentRound + 1;
        await context.redis.set(gameRoundKey, newRound.toString(), {
          expiration: new Date(Date.now() + 86400000), // 24 hours from now
        });

        // Always increment and save the round when a most voted word is processed
        // console.log('incremented game round in redis:', {
        //   currentRound: currentRound,
        //   newRound: newRound,
        //   gameRoundKey: gameRoundKey,
        //   postId: postId
        // });

        // Check if max rounds reached
        if (newRound >= MAX_ROUNDS) {
          const upperMostVotedWord = mostVotedWord.toUpperCase();
          // const connectorWords = await generateConnectorWords(context, upperMostVotedWord);
          const connectorWords = await CompleteTheStory(context, initialStory);
          console.log(
            `final story words received from ai are: ${connectorWords}`
          );

          const expandedWord =
            connectorWords.length > 0
              ? `${upperMostVotedWord} ${connectorWords.join(" ")}`.trim()
              : upperMostVotedWord;

          // Update story with expanded word
          const expandedStory = `${currentStory} ${expandedWord}`.trim();
          const finalStory = expandedStory;

          await context.redis.set(`subwords_${postId}_story`, finalStory);
          await context.redis.set(
            `subwords_${postId}_game_status`,
            "GAME_OVER"
          );
          console.log("Max rounds reached. stored GAME_OVER  status in redis");

          try {
            await context.realtime.send("game_updates", {
              type: "gameOver",
              story: finalStory,
              gameStatus: "GAME_OVER",
            });
          } catch (error) {
            console.error("Failed to broadcast game over", error);
          }
          return;
        }

        // Generate connectors for the most voted word
        const upperMostVotedWord = mostVotedWord.toUpperCase();
        // const connectorWords = await generateConnectorWords(context, upperMostVotedWord);
        const connectorWords = await generateConnectorWords(
          context,
          initialStory
        );
        console.log(`connectors words received from ai are: ${connectorWords}`);

        const expandedWord =
          connectorWords.length > 0
            ? `${upperMostVotedWord} ${connectorWords.join(" ")}`.trim()
            : upperMostVotedWord;

        // Update story with expanded word
        const expandedStory = `${currentStory} ${expandedWord}`.trim();
        await context.redis.set(`subwords_${postId}_story`, expandedStory);

        // Generate follow-up words based on the expanded story context
        const newFollowUpWords = await generateFollowUpWords(
          context,
          expandedStory
        );

        console.log("Follow-up Word Generation:", {
          expandedStory: expandedStory,
          generatedWords: newFollowUpWords,
        });

        // Filter out words already used in the story
        const usedWords = expandedStory.split(" ");
        const availableNewWords = newFollowUpWords.filter(
          (word) => !usedWords.includes(word)
        );

        // console.log('Available New Words:', {
        //   usedWords: usedWords,
        //   availableNewWords: availableNewWords
        // });

        // Create new cells, replacing ALL existing cells
        let newCells = availableNewWords.slice(0, 10).map((word) => ({
          word,
          userCount: 0,
        }));

        // console.log('New Cells Generated:', {
        //   cellCount: newCells.length,
        //   words: newCells.map(cell => cell.word)
        // });

        // COMPLETELY replace existing cells in Redis
        await context.redis.set(
          `subwords_${postId}`,
          newCells.map((cell) => cell.word).join(","),
          {
            expiration: new Date(Date.now() + 86400000), // 24 hours from now
          }
        );

        // Reset all vote counts for new words
        for (const cell of newCells) {
          await context.redis.set(
            `subwords_${postId}_${cell.word}_votes`,
            "0",
            {
              expiration: new Date(Date.now() + 86400000), // 24 hours from now
            }
          );
          await context.redis.set(
            `subwords_${postId}_${cell.word}_users`,
            "0",
            {
              expiration: new Date(Date.now() + 86400000), // 24 hours from now
            }
          );
        }

        // Broadcast cell update with new words
        try {
          console.log("Broadcasting new cells:", {
            cellCount: newCells.length,
            words: newCells.map((cell) => cell.word),
            postId: postId,
          });

          await context.realtime.send("game_updates", {
            type: "updateCells",
            cells: newCells,
            postId: postId,
          });

          await context.realtime.send("game_updates", {
            type: "updateRound",
            round: newRound,
            postId: postId,
          });
        } catch (error) {
          console.error("Failed to broadcast cell update", {
            error: error instanceof Error ? error.message : error,
            newCellsCount: newCells.length,
            newCellsWords: newCells.map((cell) => cell.word),
            postId: postId,
          });

          // Fallback: Use Redis to store cell update
          await context.redis.set(`subwords_${postId}_backup_cells`,
            JSON.stringify(newCells)
          );
        }

        try {
          const storyUpdatePayload = {
            type: "storyUpdate",
            word: expandedWord,
            story: expandedStory,
            expandedWord: expandedWord,
            timestamp: Date.now(),
          };

          await Promise.all([
            context.realtime.send("updateStory", storyUpdatePayload),
            // context.realtime.send('game_updates', {
            //   ...storyUpdatePayload,
            //   type: 'gameRoundUpdate'
            // })
          ]);

          console.log("Story update broadcasted", storyUpdatePayload);

          // Store comprehensive update in Redis
          // await context.redis.set(`subwords_${postId}_story`, JSON.stringify({
          //   storyUpdate: storyUpdatePayload,
          // }));
        } catch (realtimeError) {
          console.error("Failed to send realtime event", {
            error: realtimeError,
            message: {
              word: expandedWord,
              story: expandedStory,
              expandedWord: expandedWord,
            },
          });
        }
      } else {
        console.log("No words with votes found");
      }
    } else {
      console.log("No cells found in Redis");
    }
  },
});

Devvit.addTrigger({
  event: "PostCreate",
  onEvent: async (event, context) => {
    console.log("🚀 PostCreate Trigger Activated", {
      postId: event.post?.id,
      subredditId: event.post?.subredditId,
    });

    if (!event.post || !event.post.id) {
      console.error("❌ Invalid post data", { event });
      return;
    }

    try {
      let activeJobs = JSON.parse(
        (await context.redis.get(JOB_LIST_KEY)) || "[]"
      );

      // If we're at the limit, remove the oldest job
      if (activeJobs.length >= MAX_JOBS) {
        const oldestJob = activeJobs.shift();
        if (oldestJob) {
          await context.scheduler.cancelJob(oldestJob.jobId);
          console.log("Cancelled old job", {
            jobId: oldestJob.jobId,
            postId: oldestJob.postId,
          });
        }
      }

      // Schedule periodic job to check word votes
      const jobId = await context.scheduler.runJob({
        cron: "*/30 * * * * *",
        name: "CheckMostVotedWord",
        data: {
          postId: event.post.id,
          createdAt: new Date().toISOString(),
          triggerContext: {
            subredditId: event.post.subredditId,
          },
        },
      });

      activeJobs.push({ jobId, postId: event.post.id });
      await context.redis.set(JOB_LIST_KEY, JSON.stringify(activeJobs));
      console.log("Scheduled new job", { jobId, postId: event.post.id });

      console.log("✅ Game Initialization Complete", {
        postId: event.post.id,
        // initialWordCount: initialWords.length,
        jobId,
      });
    } catch (error) {
      console.error("❌ Post Creation Error", {
        error: error instanceof Error ? error.message : error,
      });
    }
  },
});

Devvit.addCustomPostType({
  name: "SubWords",
  height: "tall",
  render: (context) => {
    // Load username
    const [username] = useState(async () => {
      const currUser = await context.reddit.getCurrentUser();
      return currUser?.username ?? "anon";
    });

    const [status] = useState(async () => {
      const currStatus = await context.redis.get(
        `subwords_${context.postId}_game_status`
      );
      return currStatus ?? "inGame";
    });

    const [subreddit, setSureddit] = useState(async () => {
      // First, try to retrieve the existing subreddit from Redis
      const storedSubreddit = await context.redis.get(
        `subwords_${context.postId}_current_subreddit`
      );

      // If a subreddit is already stored, use it
      if (storedSubreddit) {
        console.log(`Retrieved existing subreddit: ${storedSubreddit}`);
        return storedSubreddit;
      }

      // If no subreddit is stored, select a new one
      const subreddits = ["funny", "news", "history", "movies"];
      const newSubreddit = subreddits[Math.floor(Math.random() * subreddits.length)];
      
      // Store the new subreddit in Redis
      await context.redis.set(
        `subwords_${context.postId}_current_subreddit`,
        newSubreddit,
        {
          expiration: new Date(Date.now() + 86400000),
        }
      );
      console.log(`Selected new subreddit: ${newSubreddit}`);
      return newSubreddit;
    });

    // Initialize game state from Redis
    const [cells, setCells] = useState(async () => {
      console.log(`Using subreddit: ${subreddit}`);
      const redisCells =
        (await context.redis.get(`subwords_${context.postId}`)) || null;
      const allWordsStr =
        (await context.redis.get(`subwords_${context.postId}_all_words`)) || "";
      const allWords = allWordsStr ? allWordsStr.split(",") : [];

      const gameRoundKey = `subwords_${context.postId}_game_round`;
      const currentRound = parseInt(
        (await context.redis.get(gameRoundKey)) || "1"
      );

      // console.log("Current Game Round:", {
      //   gameRoundKey: gameRoundKey,
      //   currentRound: currentRound,
      // });

      if (redisCells) {
        const existingCells = redisCells.split(",");
        const cellsWithCounts: WordData[] = await Promise.all(
          existingCells
            .filter(
              (word: string | undefined): word is string =>
                word !== undefined && word.trim() !== ""
            )
            .map(async (word: string) => {
              const key = `subwords_${context.postId}_${word}_users`;
              const count = parseInt((await context.redis.get(key)) || "0");
              return { word, userCount: count };
            })
        );

        // If cells are low, replenish from remaining words
        if (cellsWithCounts.length < 5 && allWords.length > 0) {
          const newWords = allWords.slice(0, 5 - cellsWithCounts.length);
          const newCellsWithCounts = await Promise.all(
            newWords.map(async (word: string) => ({
              word,
              userCount: 0,
            }))
          );

          // Update Redis with new words
          const updatedCells = [...existingCells, ...newWords];
          await context.redis.set(
            `subwords_${context.postId}`,
            updatedCells.join(","),
            {
              expiration: new Date(Date.now() + 86400000), // 24 hours from now
            }
          );
          await context.redis.set(
            `subwords_${context.postId}_all_words`,
            allWords.slice(5 - cellsWithCounts.length).join(","),
            {
              expiration: new Date(Date.now() + 86400000), // 24 hours from now
            }
          );

          return [...cellsWithCounts, ...newCellsWithCounts];
        }

        return cellsWithCounts;
      }

      // If no words, generate dynamically
      try {
        // const subreddits = ["funny", "news", "history", "interestingasfuck"];

        // // Select a random word
        // const subreddit =
        //   subreddits[Math.floor(Math.random() * subreddits.length)];

        console.log("Selected subreddit:", subreddit);
        const titles = await fetchRecentPostTitles(context, subreddit);
        const generatedWords = await generateWordsFromTitles(context, titles);

        // Take first 10 words
        const initialWords = generatedWords.slice(0, 10);

        // Store remaining words in Redis for future use
        await context.redis.set(
          `subwords_${context.postId}_all_words`,
          generatedWords.slice(10).join(","),
          {
            expiration: new Date(Date.now() + 86400000), // 24 hours from now
          }
        );
        await context.redis.set(
          `subwords_${context.postId}_total_words`,
          generatedWords.join(","),
          {
            expiration: new Date(Date.now() + 86400000), // 24 hours from now
          }
        );

        const cellsWithCounts: WordData[] = initialWords
          .filter(
            (word: string | undefined): word is string =>
              word !== undefined && word.trim() !== ""
          )
          .map((word) => ({
            word,
            userCount: 0,
          }));

        // Store initial words in Redis
        await context.redis.set(
          `subwords_${context.postId}`,
          initialWords.join(","),
          {
            expiration: new Date(Date.now() + 86400000), // 24 hours from now
          }
        );

        return cellsWithCounts;
      } catch (error) {
        console.error("Word generation failed, using fallback", error);

        // Game over scenario: no words available
        await context.redis.set(
          `subwords_${context.postId}_game_status`,
          "GAME_OVER"
        );
        return [{ word: "GAME OVER", userCount: 0 }];
      }
    });

    const [story, setStory] = useState(async () => {
      const redisStory =
        (await context.redis.get(`subwords_${context.postId}_story`)) || "";
      return redisStory;
    });

    // Set up periodic word voting check

    const [webviewVisible, setWebviewVisible] = useState(false);

    const mySession = sessionId();

    const channel2 = useChannel({
      name: `updateStory`,
      onMessage: (data) => {
        // Update local state if needed
        context.ui.webView.postMessage("myWebView", {
          type: "updateTextField",
          data: data,
        });
      },
    });

    channel2.subscribe();

    const channel = useChannel({
      name: `game_updates`,
      onMessage: (message: any) => {
        console.log("Channel received message:", message);

        if (message.session === mySession) {
          console.log("Ignoring own message");
          return;
        }

        setCells(message.cells);

        // Notify webview of updates
        context.ui.webView.postMessage("myWebView", {
          type: "updateGameCells",
          data: {
            currentCells: message.cells,
          },
        });

        context.ui.webView.postMessage("myWebView", {
          type: "updateGameRound",
          data: {
            currentRound: message.round,
          },
        });

        context.ui.webView.postMessage("myWebView", {
          type: "gameOver",
          data: {
            story: message.story,
          },
        });

        // Ensure the local state is also updated
        setCells(message.cells);
      },
      onSubscribed: () => {
        console.log("Connected to realtime channel");
      },
      onUnsubscribed: () => {
        console.log("Disconnected from realtime channel");
      },
    });

    // channel.subscribe();
    //receiving messages from webview
    const onMessage = async (msg: any) => {
      switch (msg.type) {
        case "btnTrigger":
          try {
            console.log("entered button trigger condition in devvit");
            const canVote =
              (await context.redis.get(
                `subwords_${context.postId}_${username}_canVote`
              )) || "";

            await context.redis.set(
              `subwords_${context.postId}_${username}_canVote`,
              "false",
              {
                expiration: new Date(Date.now() + 86400000), // 24 hours from now
              }
            );
            console.log(
              `changed the value of  canVote to false for ${username} after button triger`
            );

            context.ui.webView.postMessage("myWebView", {
              type: "voteStatus",
              data: {
                canVote: canVote,
              },
            });
          } catch (error) {
            console.error("errro inside devvit btnTriger code", error);
          }

          break;

        case "saveCells":
          // Process only the newly selected cells
          const existingCellsStr =
            (await context.redis.get(`subwords_${context.postId}`)) || "";
          const existingCells = existingCellsStr
            ? existingCellsStr.split(",")
            : [];

          // Validate that new cells are actually in the current game cells
          const validNewCells = msg.data.newCells.filter((word: string) =>
            existingCells.includes(word)
          );

          const updatedCellsWithCounts: WordData[] = await Promise.all(
            existingCells.map(async (word: string) => {
              const key = `subwords_${context.postId}_${word}_users`;
              const voteKey = `subwords_${context.postId}_${word}_votes`;

              const userCount = parseInt((await context.redis.get(key)) || "0");
              const voteCount = parseInt(
                (await context.redis.get(voteKey)) || "0"
              );

              const isNewlySelected = validNewCells.includes(word);

              // Only increment if the word is newly selected
              const updatedUserCount = isNewlySelected
                ? userCount + 1
                : userCount;
              const updatedVoteCount = isNewlySelected
                ? voteCount + 1
                : voteCount;

              await context.redis.set(key, updatedUserCount.toString(), {
                expiration: new Date(Date.now() + 86400000), // 24 hours from now
              });
              await context.redis.set(voteKey, updatedVoteCount.toString(), {
                expiration: new Date(Date.now() + 86400000), // 24 hours from now
              });

              return {
                word,
                userCount: updatedUserCount,
              };
            })
          );

          // Check if "END STORY" cell exists and has majority votes
          const gameRoundKey = `subwords_${context.postId}_game_round`;
          const currentRound = parseInt(
            (await context.redis.get(gameRoundKey)) || "1"
          );

          if (currentRound >= 3) {
            const endStoryVoteKey = `subwords_${context.postId}_END STORY_votes`;
            const endStoryVotes = parseInt(
              (await context.redis.get(endStoryVoteKey)) || "0"
            );
            const totalVotes = await updatedCellsWithCounts.reduce(
              async (sumPromise, cell) => {
                const sum = await sumPromise;
                const voteKey = `subwords_${context.postId}_${cell.word}_votes`;
                return (
                  sum + parseInt((await context.redis.get(voteKey)) || "0")
                );
              },
              Promise.resolve(0)
            );

            if (endStoryVotes > totalVotes / 2) {
              // Story ends, notify webview
              context.ui.webView.postMessage("myWebView", {
                type: "storyCompleted",
                data: {
                  story:
                    (await context.redis.get(
                      `subwords_${context.postId}_story`
                    )) || "",
                },
              });
            }
          }

          // Broadcast updated cells to all players in real-time
          await channel.send({
            type: "updateCells",
            cells: updatedCellsWithCounts,
            session: mySession, // Prevent echo
          });

          // Update the state with the new cells
          setCells(updatedCellsWithCounts);

          // Also send to webview for immediate update
          context.ui.webView.postMessage("myWebView", {
            type: "updateGameCells",
            data: {
              currentCells: updatedCellsWithCounts,
            },
          });
          break;
        case "resetCanVote":
          await context.redis.set(
            `subwords_${context.postId}_${username}_canVote`,
            "true",
            {
              expiration: new Date(Date.now() + 86400000), // 24 hours from now
            }
          );
          console.log(`setting the vote count value of ${username} to true`);
          break;
        case "saveStory":
          const storyText = msg.data.story;
          await context.redis.set(
            `subwords_${context.postId}_story`,
            storyText
          );

          setStory(storyText);

          // Broadcast story update to realtime channel
          await channel.send({
            type: "storyUpdate",
            story: storyText,
          });

          // Also send to the updateStory channel for broader compatibility
          await channel2.send({
            type: "storyUpdate",
            word: storyText,
            story: storyText,
          });
          break;
        case "voteWord":
          const votedWord = msg.data.word;
          const voteKey = `subwords_${context.postId}_${votedWord}_votes`;
          const currentVotes = parseInt(
            (await context.redis.get(voteKey)) || "0"
          );
          const newVoteCount = currentVotes + 1;
          await context.redis.set(voteKey, newVoteCount.toString(), {
            expiration: new Date(Date.now() + 86400000), // 24 hours from now
          });

          console.log("Word voted:", {
            word: votedWord,
            voteKey: voteKey,
            previousVotes: currentVotes,
            newVotes: newVoteCount,
          });
          break;

        case "initialData":
        case "updateGameCells":
          break;

        default:
          throw new Error(`Unknown message type: ${msg}`);
      }
    };

    const onStartGame = async () => {
      await context.redis.set(
        `subwords_${context.postId}_${username}_canVote`,
        "true",
        {
          expiration: new Date(Date.now() + 86400000), // 24 hours from now
        }
      );
      const initialVoteStatusCheck = await context.redis.get(
        `subwords_${context.postId}_${username}_canVote`
      );
      console.log(
        "initial vote status for ",
        `${username} is: ${initialVoteStatusCheck}`
      );

      

      console.log("Starting game, subscribing to channel");
      setWebviewVisible(true);
      channel.subscribe();
      console.log("Channel subscribed");
      const gameStatus = await context.redis.get(
        `subwords_${context.postId}_game_status`
      );
      console.log(`checking game status on start: ${gameStatus}`);
      console.log(`the final story is : ${story}`);

      if (gameStatus === "GAME_OVER") {
        try {
          context.ui.webView.postMessage("myWebView", {
            type: "gameOver",
            data: {
              story: story || {},
            },
          });
        } catch (error) {
          console.error("Failed to broadcast game over", error);
        }
      }

      // Retrieve game round from Redis, default to 1 if not set
      else {
        const gameRoundKey = `subwords_${context.postId}_game_round`;
        const currentRound = parseInt(
          (await context.redis.get(gameRoundKey)) || "1"
        );
        const fontUrl = await context.assets.getURL("ARCADECLASSIC.TTF");
        console.log("font url is: ", fontUrl);

        const timerUrl = await context.assets.getURL("timergif.gif");
        console.log("bg url is: ", timerUrl);
        console.log(`Subreddit value in onStartGame: ${subreddit}`);
        context.ui.webView.postMessage("myWebView", {
          type: "initialData",
          data: {
            username: username,
            currentCells: cells,
            story: story,
            gameRound: currentRound,
            timeRemaining: 30, 
            fontUrl: fontUrl,
            timerUrl: timerUrl,
            subreddit: subreddit || 'default',
          },
        });
      }
    };
    return (
      <vstack grow padding="small">
        <vstack
          grow={!webviewVisible}
          height={webviewVisible ? "0%" : "100%"}
          alignment="middle center"
        >
          <zstack width="100%" height="100%">
            {status === "GAME_OVER" ? (
              <image
                url="finalstory.png"
                imageWidth={100}
                imageHeight={100}
                width="100%"
                height="100%"
              />
            ) : (
              <image
                url="ssbg.png"
                imageWidth={100}
                imageHeight={100}
                width="100%"
                height="100%"
              />
            )}

            <vstack alignment="middle center" width="100%" height="100%" padding="small">
              <spacer width="30%"/>
              {status === "GAME_OVER" ? (
              <spacer height="35%" />
              ):(
                <spacer height="50%" />
              )}
              {status === "GAME_OVER" ? (
                <vstack padding="small" width="70%">
                  <text
                    wrap
                    size="xxlarge"
                    weight="bold"
                    color="black"
                    alignment="center"
                    width="100%"
                    style="heading"
                    outline="thick"
                  >
                    {`"${story}"`}
                  </text>
                </vstack>
              ) : (
                <vstack padding="small" >
                <image
                  url="start_gif.gif"
                  imageWidth={240}
                  imageHeight={120}
                  onPress={onStartGame}
                />
                </vstack>
              )}
              <spacer grow />
            </vstack>
          </zstack>
        </vstack>
        <vstack grow={webviewVisible} height={webviewVisible ? "100%" : "0%"}>
          <vstack
            border="thick"
            borderColor="black"
            height={webviewVisible ? "100%" : "0%"}
          >
            <webview
              id="myWebView"
              url="page.html"
              onMessage={(msg) => onMessage(msg as WebViewMessage)}
              grow
              height={webviewVisible ? "100%" : "0%"}
            />
          </vstack>
        </vstack>
      </vstack>
    );
  },
});

export default Devvit;
