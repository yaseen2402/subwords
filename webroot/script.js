class WordGuesserGame {
  constructor() {
    this.words = []; // Words will be dynamically loaded
    this.story = "";
    this.gridContainer = document.getElementById("grid");
    this.message = document.getElementById("message");
    this.voteStatusPromise = null; // Promise to wait for voteStatus
    this.voteStatusResolve = null; // Resolver for the Promise
    this.postId = null;
    this.username = "Guest";
    this.cellSelections = {};
    this.currentCells = [];
    this.gameRound = 1;
    this.canVote = ""
    this.channel = new BroadcastChannel("game_updates");

    this.initGame();
  }

  // Initialize game
  initGame() {
    this.resetVoteStatusPromise();
    this.storyElement = document.getElementById("story");
    this.countdownElement = document.getElementById("countdown-timer");
    this.countdownInterval = null;

    // handling messages sent from devvit app
    window.addEventListener("message", (event) => {
      console.log("Received message in script:", event.data);
      try {
        const { type, data } = event.data;

        if (type == "devvit-message") {
          console.log("Devvit message received:", data);

          const { message } = data;

          console.log("going inside the nested message", message.data);

          if (message.type === "initialData") {
            const { username, currentCells, story, gameRound } = message.data;
            console.log("Initial data:", {
              username,
              currentCells,
              story,
              gameRound,
            });
            this.username = username;
            this.currentCells = currentCells || [];
            this.gameRound = gameRound || 1;

            // Set words from currentCells before creating grid
            this.words = this.currentCells.map((cell) => cell.word);

            // Create grid after setting words
            this.createGrid();
            this.addEventListeners();

            this.updateGridFromGameState();

            // Update story and game round
            this.storyElement.innerText = story || "";
            this.updateGameRoundDisplay();

            // Start countdown timer
            this.startCountdownTimer(30);
          }

          if (message.type === "storyCompleted") {
            const { story } = message.data;
            this.storyElement.innerText = story;
            this.showStoryCompletedScreen();
          }

          if (message.type === "voteStatus") {
            const { canVote } = message.data;
            console.log("vote status sent by devvit:",canVote)
            this.canVote = canVote;


            if (this.voteStatusResolve) {
              this.voteStatusResolve(canVote);
              this.resetVoteStatusPromise(); // Reset for future uses
            }
          }

          if (message.type === "updateGameCells") {
            console.log("Received game cell update:", message);
            // Parse the stringified data
            const { currentCells } = message.data || {};

            if (currentCells) {
              console.log("Update game cells:", currentCells);
              this.currentCells = currentCells || [];
              this.updateGridFromGameState();
            }
          }

          if (message.type === "updateGameRound") {
            console.log("Received game round update:", message);
            // Parse the stringified data
            const { currentRound } = message.data || {};

            if (currentRound) {
              console.log("Update game round", currentRound);
              this.gameRound = currentRound;
              this.updateGameRoundDisplay();

              // Restart countdown timer for each new round
              this.startCountdownTimer(30);
            }
          }

          if (message.type === "gameOver") {
            console.log("received game over message from channel", message);

            const { story } = message.data || {};
            console.log("final story is", story);
            if (story) {
              console.log("Update game round", story);
              this.storyElement.innerText = story;
              this.showStoryCompletedScreen();
            }
          }

          if (message.type === "updateTextField") {
            console.log("Received story update message", message.data);
            window.parent?.postMessage(
              {
                type: "resetCanVote",
                data: {
                  no: "no data needed"
                },
              },
              "*"
            );
            this.updateTextField(message.data);
          }
        }
      } catch (error) {
        console.error("Error processing message:", error);
      }
    });

    this.channel.onmessage = (event) => {
      if (event.data) {
        console.log("Channel message received:", event.data);
        switch (event.data.type) {
          case "updateCells":
            console.log("Received cell update:", event.data.cells);
            this.currentCells = event.data.cells;
            this.updateGridFromGameState();
            break;
          case "storyUpdate":
            console.log("Received story update via channel:", event.data);
            const storyToDisplay =
              event.data.story ||
              (event.data.word
                ? `${this.storyElement.innerText} ${event.data.word}`
                : "");
            this.storyElement.innerText = storyToDisplay.trim();
            break;
          case "gameOver":
            console.log("Game over received:", event.data);
            this.showStoryCompletedScreen();
            break;
          case "updateRound":
            console.log("Received game round update:", event.data);
            this.gameRound = event.data.round;
            this.updateGameRoundDisplay();
            break;
        }
      }
    };
  }

  // Create the grid of words
  createGrid() {
    this.gridContainer.innerHTML = "";

    this.words.forEach((word, index) => {
      const cell = document.createElement("div");
      cell.classList.add("cell");
      cell.innerText = word;
      cell.dataset.word = word;
      cell.dataset.id = index + 1;

      const playerCountEl = document.createElement("div");
      playerCountEl.classList.add("cell-players");
      cell.appendChild(playerCountEl);

      this.gridContainer.appendChild(cell);
    });
  }

  updateTextField(data) {
    console.log("Updating text field with latest story", data);
    if (data && (data.expandedWord || data.word)) {
      // Prefer expandedWord, fallback to word
      const wordToAppend = data.expandedWord || data.word;

      // Append the full word to the story
      const currentStory = this.storyElement.innerText;
      const updatedStory = `${currentStory} ${wordToAppend}`.trim();
      this.storyElement.innerText = updatedStory;
    }
  }
  updateGridFromGameState() {
    console.log("Updating grid with cells:", JSON.stringify(this.currentCells));

    // Clear existing grid
    this.gridContainer.innerHTML = "";

    // Recreate grid with new cells
    this.words = this.currentCells.map((cell) =>
      typeof cell === "string" ? cell : cell.word
    );

    // Check for story completion
    if (this.words.includes("END STORY")) {
      this.showStoryCompletedScreen();
      return;
    }

    this.createGrid();

    document.querySelectorAll(".cell").forEach((cell) => {
      const word = cell.dataset.word;

      const cellData = this.currentCells.find((c) => {
        if (typeof c === "string") return c === word;
        return c.word === word;
      });

      if (cellData) {
        const userCount =
          typeof cellData === "string" ? 0 : cellData.userCount || 0;

        let color;

        if (word === "END STORY") {
          color = "#FF6347"; // Tomato red for End Story cell
        } else if (userCount <= 2) {
          color = "#90EE90"; // Light green
        } else if (userCount <= 5) {
          color = "#32CD32"; // Medium green
        } else {
          color = "#40c632"; // Dark green
        }

        cell.style.backgroundColor = color;
        cell.dataset.userCount = userCount.toString();

        const playerCountEl =
          cell.querySelector(".cell-players") || document.createElement("div");
        playerCountEl.classList.add("cell-players");
        playerCountEl.textContent = userCount > 0 ? `+${userCount}` : "";
        cell.appendChild(playerCountEl);
      }
    });

    // Broadcast updated grid state to other players
    this.channel.postMessage({
      type: "updateCells",
      cells: this.currentCells,
    });
  }

  // Synchronize countdown timer across all clients
  syncCountdownTimer(seconds) {
    // Broadcast timer start to all clients
    window.parent?.postMessage(
      {
        type: "syncTimer",
        data: {
          seconds: seconds,
          timestamp: Date.now(),
        },
      },
      "*"
    );

    // Start local timer
    this.startCountdownTimer(seconds);
  }

  showStoryCompletedScreen() {
    // Create a story completed overlay
    const storyCompletedOverlay = document.createElement("div");
    storyCompletedOverlay.id = "story-completed-overlay";
    storyCompletedOverlay.innerHTML = `
      <div class="story-completed-content">
        <h1>Final Story</h1>
        <div id="final-story-text" style="white-space: pre-wrap; text-align: left; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4; border-radius: 10px;"></div>
      </div>
    `;

    // Style the overlay
    storyCompletedOverlay.style.position = "fixed";
    storyCompletedOverlay.style.top = "0";
    storyCompletedOverlay.style.left = "0";
    storyCompletedOverlay.style.width = "100%";
    storyCompletedOverlay.style.height = "100%";
    storyCompletedOverlay.style.backgroundColor = "rgba(0,0,0,0.7)";
    storyCompletedOverlay.style.display = "flex";
    storyCompletedOverlay.style.justifyContent = "center";
    storyCompletedOverlay.style.alignItems = "center";
    storyCompletedOverlay.style.zIndex = "1000";

    // Add to body
    document.body.appendChild(storyCompletedOverlay);

    // Set final story text with better formatting
    const finalStoryText = this.storyElement.innerText;
    document.getElementById("final-story-text").textContent = finalStoryText;
    
  }

  updateGameRoundDisplay() {
    // Create or update game round display
    let gameRoundEl = document.getElementById("game-round");
    if (!gameRoundEl) {
      gameRoundEl = document.createElement("div");
      gameRoundEl.id = "game-round";
      gameRoundEl.classList.add("game-round");
      document.getElementById("game-container").prepend(gameRoundEl);
    }
    console.log("Updating game round display:", this.gameRound);
    gameRoundEl.textContent = `Round: ${this.gameRound}`;
  }

  startCountdownTimer(seconds = 30) {
    // Clear any existing interval
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }

    // Reset timer color to default
    this.countdownElement.style.color = "#ff4500";

    // Set initial time
    this.countdownElement.textContent = seconds;

    this.countdownInterval = setInterval(() => {
      seconds--;
      this.countdownElement.textContent = seconds;

      // Change color as time gets low
      if (seconds <= 10) {
        this.countdownElement.style.color = "#ff0000"; // Red
      }

      if (seconds <= 0) {
        clearInterval(this.countdownInterval);
        this.countdownElement.textContent = "0";
        this.countdownElement.style.color = "#ff0000"; // Ensure red
      }
    }, 1000);
  }

  showGameOverScreen() {
    // Create a game over overlay
    const gameOverOverlay = document.createElement("div");
    gameOverOverlay.id = "game-over-overlay";
    gameOverOverlay.innerHTML = `
      <div class="game-over-content">
        <h1>Game Over</h1>
        <p>Final Story</p>
        <div class="final-story-text">${this.storyElement.innerText}</div>
      </div>
    `;

    // Style the overlay
    gameOverOverlay.style.position = "fixed";
    gameOverOverlay.style.top = "0";
    gameOverOverlay.style.left = "0";
    gameOverOverlay.style.width = "100%";
    gameOverOverlay.style.height = "100%";
    gameOverOverlay.style.backgroundColor = "rgba(0,0,0,0.9)";
    gameOverOverlay.style.display = "flex";
    gameOverOverlay.style.justifyContent = "center";
    gameOverOverlay.style.alignItems = "center";
    gameOverOverlay.style.zIndex = "1000";
    gameOverOverlay.style.color = "white";
    gameOverOverlay.style.padding = "20px";
    gameOverOverlay.style.textAlign = "center";

    // Add to body
    document.body.appendChild(gameOverOverlay);
  }

  resetVoteStatusPromise() {
    this.voteStatusPromise = new Promise((resolve) => {
      this.voteStatusResolve = resolve;
    });
  }

  // Add event listeners for word selection
  addEventListeners() {
    let selectedCell = null;

    this.gridContainer.addEventListener("click", (event) => {
      const cell = event.target.closest(".cell");

      // Always allow cell selection before confirm button
      if (cell) {
        // Deselect previous cell if exists
        if (selectedCell) {
          selectedCell.classList.remove("selected");
        }

        // Select new cell
        cell.classList.add("selected");
        selectedCell = cell;

        // Add a ripple effect
        const ripple = document.createElement("div");
        ripple.classList.add("ripple");
        cell.appendChild(ripple);

        // Remove ripple after animation
        setTimeout(() => {
          ripple.remove();
        }, 1000);
      }
    });

    document.getElementById("confirm").addEventListener("click", async () => {
      try {
        // Get all selected cells

        window.parent?.postMessage(
          {
            type: "btnTrigger",
            data: {
              status: 'clicked',
            },
          },
          "*"
        );

        console.log("Waiting for voteStatus...");
        
        // Wait for the voteStatus to be updated
        await this.voteStatusPromise;

        if (this.canVote === "false"){
          console.log("canVote is false, u cannot vote in this round anymore")
          return;
        }
        const selectedCells = Array.from(
          document.querySelectorAll(".cell.selected")
        )
          .map((cell) => cell.dataset.word)
          .filter(Boolean);

        if (selectedCells.length === 0) return;

        // Notify Devvit to sync state with ONLY the newly selected cells
        window.parent?.postMessage(
          {
            type: "saveCells",
            data: {
              newCells: selectedCells,
              session: Math.random().toString(36).substring(2), // Generate a unique session ID
            },
          },
          "*"
        );

        // Vote for selected words
        selectedCells.forEach((word) => {
          window.parent?.postMessage(
            {
              type: "voteWord",
              data: { word },
            },
            "*"
          );
        });

      } catch (error) {
        console.error("Error processing selection:", error);
      }
    });
  }

  arraysMatch(arr1, arr2) {
    if (arr1.length !== arr2.length) return false;
    return arr1.every((word) => arr2.includes(word));
  }
}

// Initialize game
new WordGuesserGame();
