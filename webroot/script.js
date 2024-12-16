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
    this.fontUrl = ""
    this.timerUrl = ""
    this.subreddit = ""
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
            const { username, currentCells, story, gameRound, fontUrl, timerUrl, subreddit } = message.data;
            console.log("Initial data:", {
              username,
              currentCells,
              story,
              gameRound,
              fontUrl,
              timerUrl,
              subreddit,
            });
            this.username = username;
            this.currentCells = currentCells || [];
            this.gameRound = gameRound || 1;
            this.fontUrl = fontUrl
            this.timerUrl = timerUrl
            this.subreddit = subreddit

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

          // if (message.type === "storyCompleted") {
          //   const { story } = message.data;
          //   this.storyElement.innerText = story;
          //   this.showStoryCompletedScreen();
          // }

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
    const logo = document.getElementById("timer-logo");
    logo.src = this.timerUrl;
    logo.style.width = "35px";
    logo.style.height = "35px";
    logo.style.filter = "drop-shadow(2px 2px 4px rgba(0,0,0,0.3))";
    
    // Limit to 8 words
    const displayWords = this.words.slice(0, 8);
    
    document.body.style.backgroundSize = "400% 400%";
    document.body.style.backgroundRepeat = "no-repeat";
    document.body.style.backgroundPosition = "center";
    document.body.style.animation = "gradientBG 15s ease infinite";

    displayWords.forEach((word, index) => {
      const cell = document.createElement("div");
      cell.classList.add("cell");
      
      // Create word container
      const wordSpan = document.createElement("span");
      wordSpan.textContent = word;
      wordSpan.style.position = "relative";
      wordSpan.style.zIndex = "1";
      
      cell.appendChild(wordSpan);
      cell.dataset.word = word;
      cell.dataset.id = index + 1;

      // Add hover effect
      cell.addEventListener('mouseover', () => {
        cell.style.transform = `translateY(-5px) scale(1.02) rotate(${Math.random() * 2 - 1}deg)`;
      });
      
      cell.addEventListener('mouseout', () => {
        cell.style.transform = 'translateY(0) scale(1) rotate(0deg)';
      });

      const playerCountEl = document.createElement("div");
      playerCountEl.classList.add("cell-players");
      cell.appendChild(playerCountEl);

      this.gridContainer.appendChild(cell);
    });
  }

  updateTextField(data) {
    console.log("Updating text field with latest story", data);
    if (data && (data.expandedWord || data.word)) {
      const wordToAppend = data.expandedWord || data.word;
      
      // Create a new span for the word with animation
      const wordSpan = document.createElement("span");
      wordSpan.textContent = ` ${wordToAppend}`;
      wordSpan.style.opacity = "0";
      wordSpan.style.transform = "translateY(20px)";
      wordSpan.style.transition = "all 0.5s ease";
      wordSpan.style.display = "inline-block";
      wordSpan.style.fontFamily = this.fontUrl || "sans-serif";
      
      this.storyElement.appendChild(wordSpan);
      this.sto
      
      // Trigger animation
      setTimeout(() => {
        wordSpan.style.opacity = "1";
        wordSpan.style.transform = "translateY(0)";
      }, 50);

      // Add sparkle effect
      this.addSparkleEffect(wordSpan);
    }
  }

  addSparkleEffect(element) {
    const sparkle = document.createElement("div");
    sparkle.style.position = "absolute";
    sparkle.style.width = "100%";
    sparkle.style.height = "100%";
    sparkle.style.pointerEvents = "none";
    sparkle.style.background = "radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 60%)";
    sparkle.style.opacity = "0";
    sparkle.style.transition = "opacity 0.3s ease";
    
    element.appendChild(sparkle);
    
    setTimeout(() => {
      sparkle.style.opacity = "0.5";
      setTimeout(() => {
        sparkle.style.opacity = "0";
        setTimeout(() => sparkle.remove(), 300);
      }, 300);
    }, 50);
  }
  updateGridFromGameState() {
    console.log("Updating grid with cells:", JSON.stringify(this.currentCells));

    // Clear existing grid
    this.gridContainer.innerHTML = "";

    // Recreate grid with new cells
    this.words = this.currentCells.map((cell) =>
      typeof cell === "string" ? cell : cell.word
    );


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

        if (userCount == 0) {
          color = "#FFFFFF"; // Tomato red for End Story cell
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
    // this.channel.postMessage({
    //   type: "updateCells",
    //   cells: this.currentCells,
    // });
  }

  showStoryCompletedScreen() {
    const storyCompletedOverlay = document.createElement("div");
    storyCompletedOverlay.id = "story-completed-overlay";
    storyCompletedOverlay.innerHTML = `
        <div class="scroll-container">
          <div class="scroll-header">📖 Final Story</div>
          <div id="final-story-text" class="final-story"></div>
        </div>

    `;
    

    // Style the overlay with animation
    Object.assign(storyCompletedOverlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(0,0,0,0.9)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: "1000",
      opacity: "0",
      transition: "opacity 0.8s ease"
    });

    // Add to body and animate in
    document.body.appendChild(storyCompletedOverlay);
    requestAnimationFrame(() => {
      storyCompletedOverlay.style.opacity = "1";
    });

    // Set final story text with animation
    const finalStoryText = this.storyElement.innerText;
    const finalStoryElement = document.getElementById("final-story-text");
    
    // Animate each word with enhanced effects
    finalStoryText.split(" ").forEach((word, index) => {
      const wordSpan = document.createElement("span");
      wordSpan.textContent = word + " ";
      wordSpan.className = "story-word";
      wordSpan.style.opacity = "0";
      wordSpan.style.transform = "translateY(20px) scale(0.95)";
      wordSpan.style.transition = "all 0.6s cubic-bezier(0.4, 0, 0.2, 1)";
      wordSpan.style.transitionDelay = `${index * 0.08}s`;
      finalStoryElement.appendChild(wordSpan);
      
      setTimeout(() => {
        wordSpan.style.opacity = "1";
        wordSpan.style.transform = "translateY(0) scale(1)";
      }, 100 + index * 80);
    });

    // Add sparkle animation to stars
    const stars = storyCompletedOverlay.querySelectorAll('.completion-stars span');
    stars.forEach((star, index) => {
      star.style.animationDelay = `${index * 0.2}s`;
    });
  }

  updateGameRoundDisplay() {
    // Create or update game round display
    let gameRoundEl = document.getElementById("game-round");
    let subredditEl = document.getElementById("subreddit-display");
    
    if (!gameRoundEl) {
      gameRoundEl = document.createElement("div");
      gameRoundEl.id = "game-round";
      gameRoundEl.classList.add("game-round");
      document.getElementById("game-container").prepend(gameRoundEl);
    }
    
    if (!subredditEl) {
      subredditEl = document.createElement("div");
      subredditEl.id = "subreddit-display";
      subredditEl.classList.add("subreddit-display");
      
      const subredditText = document.createElement("span");
      subredditText.textContent = `r/${this.subreddit}`;
      
      // const questionIcon = document.createElement("span");
      // questionIcon.innerHTML = "❓";
      // questionIcon.classList.add("question-icon");
      
      const tooltip = document.createElement("div");
      tooltip.classList.add("subreddit-tooltip");
      tooltip.textContent = `Words are taken from r/${this.subreddit}`;
      
      subredditEl.appendChild(subredditText);
      // subredditEl.appendChild(questionIcon);
      subredditEl.appendChild(tooltip);
      
      document.getElementById("game-round-container").appendChild(subredditEl);
    } else {
      const subredditText = subredditEl.querySelector("span:first-child");
      subredditText.textContent = `r/${this.subreddit}`;
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
        this.countdownElement.textContent = "Overtime";
        this.countdownElement.style.color = "#ff0000"; // Ensure red
      }
    }, 1000);
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
      const confirmButton = document.getElementById("confirm");
      try {
        confirmButton.disabled = true;
        const selectedCells = Array.from(
          document.querySelectorAll(".cell.selected")
        )
          .map((cell) => cell.dataset.word)
          .filter(Boolean);
        // Check if no cell is selected
        if (selectedCells.length === 0) {
          const toast = document.getElementById('toast');
          toast.textContent = "Please select a word first";
          toast.classList.add('show');
          setTimeout(() => {
            toast.classList.remove('show');
          }, 2500);
          return;
        }
        
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
          console.log("canVote is false, u cannot vote in this round anymore");
          const toast = document.getElementById('toast');
          toast.textContent = "You can only vote once per round";
          toast.classList.add('show');
          setTimeout(() => {
            toast.classList.remove('show');
          }, 2500);
          return;
        }


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
      }finally {
        // Ensure the button is always re-enabled, even in case of errors or early returns
        confirmButton.disabled = false;
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
