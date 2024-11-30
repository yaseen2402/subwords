class WordGuesserGame {
  constructor() {
      this.words = [
          "APPLE", "BERRY", "CHESS", "DAISY", "EAGLE",
          "FANCY", "GIANT", "HONEY", "IRONY", "JOKER",
          "KNEEL", "LUNCH", "MONEY", "NIGHT", "OASIS",
          "PAPER", "QUIRK", "ROBIN", "SNAKE", "TIGER",
          "UNITY", "VIVID", "WORRY", "XENON", "YEARN",
      ];
      this.correctWords = ["APPLE", "MONEY", "PAPER"]; 
      this.hint = "material things.";
      this.gridContainer = document.getElementById("grid");
      this.message = document.getElementById("message");
      
      this.postId = null;
      this.username = 'Guest';
      this.gameState = {
        cellSelections: {},
        userSelections: {}
      };

      this.initGame();
  }

  // Initialize game
  initGame() {
    document.getElementById("hint").innerText = this.hint;
    this.createGrid();
    this.addEventListeners();
    
    // WebView message handling
    window.addEventListener('message', (event) => {
        try {
            const { type, data } = JSON.parse(event.data);
            if (type === 'initialData') {
                const parsedData = JSON.parse(data);
                this.postId = parsedData.postId;
                this.username = parsedData.username;
                
                // If there's an existing game state, load it
                if (parsedData.gameState) {
                    this.gameState = parsedData.gameState;
                    this.updateGridFromGameState();
                }
            } else if (type === 'updateGameState') {
                // Handle real-time updates from other players
                this.gameState = JSON.parse(data);
                this.updateGridFromGameState();
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });
  }

  // Create the grid of words
  createGrid() {
      this.gridContainer.innerHTML = ''; // Clear any existing grid content

      this.words.forEach((word, index) => {
          const cell = document.createElement("div");
          cell.classList.add("cell");
          cell.innerText = word;
          cell.dataset.word = word;

          const playerCountEl = document.createElement("div");
          playerCountEl.classList.add("cell-players");
          cell.appendChild(playerCountEl);

          this.gridContainer.appendChild(cell);
      });
  }

  updateGridFromGameState() {
    // Update grid based on game state
    document.querySelectorAll(".cell").forEach(cell => {
        const word = cell.dataset.word;
        const playerCountEl = cell.querySelector('.cell-players');
        
        if (this.gameState.cellSelections[word]) {
            const playerCount = Object.keys(this.gameState.cellSelections[word]).length;
            
            // Update cell color based on player count
            cell.style.backgroundColor = this.getColorIntensity(playerCount);
            
            // Update player count
            playerCountEl.textContent = `${playerCount} player${playerCount !== 1 ? 's' : ''}`;
        } else {
            cell.style.backgroundColor = '';
            playerCountEl.textContent = '';
        }
    });
  }

  getColorIntensity(playerCount) {
    // More players = darker green
    const baseGreen = 50;
    const intensity = Math.min(playerCount * 20 + baseGreen, 255);
    return `rgb(${255 - intensity}, 255, ${255 - intensity})`;
  }


  // Add event listeners for word selection
  addEventListeners() {
    this.gridContainer.addEventListener("click", (event) => {
        const cell = event.target.closest(".cell");
        if (cell) {
            cell.classList.toggle("selected");
        }
    });

    document.getElementById("checkAnswer").addEventListener("click", () => {
        const selectedWords = Array.from(document.querySelectorAll(".cell.selected"))
            .map(cell => cell.dataset.word);
        
        // Update game state with user's selections
        selectedWords.forEach(word => {
            if (!this.gameState.cellSelections[word]) {
                this.gameState.cellSelections[word] = {};
            }
            this.gameState.cellSelections[word][this.username] = true;
        });

        // Add user's selections to game state
        this.gameState.userSelections[this.username] = selectedWords;

        const isCorrect = this.arraysMatch(selectedWords, this.correctWords);

        if (isCorrect) {
            this.message.style.color = "#4caf50";
            this.message.innerText = `Congratulations, ${this.username}! You found the correct words!`;
        } else {
            this.message.style.color = "#d32f2f";
            this.message.innerText = "Try again!";
        }

        // Save state and notify Devvit
        window.ReactNativeWebView?.postMessage(JSON.stringify({
            type: 'save-state',
            data: { 
                postId: this.postId, 
                gameState: this.gameState 
            }
        }));

        // Update grid visualization
        this.updateGridFromGameState();
    });

    document.getElementById("hint-btn").addEventListener("click", () => {
        alert("Hint: " + this.hint);
    });
  }

  arraysMatch(arr1, arr2) {
    if (arr1.length !== arr2.length) return false;
    return arr1.every(word => arr2.includes(word));
  }
}


// Initialize game
new WordGuesserGame();
