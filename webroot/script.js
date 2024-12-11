class WordGuesserGame {
  constructor() {
      this.words = []; // Words will be dynamically loaded
      this.story = "";
      this.gridContainer = document.getElementById("grid");
      this.message = document.getElementById("message");
      
      this.postId = null;
      this.username = 'Guest';
      this.cellSelections = {};
      this.currentCells = []; 
      this.gameRound = 0;  // Track game round

      this.channel = new BroadcastChannel('game_updates');

      this.initGame();
  }

  // Initialize game
  initGame() {
    this.storyElement = document.getElementById("story");
    
    // handling messages sent from devvit app 
    window.addEventListener('message', (event) => {
        console.log('Received message in script:', event.data);
        try {
          const { type, data} = event.data;
          
          if(type=='devvit-message'){
            console.log('Devvit message received:', data);
            
            const{message} = data;

            console.log('going inside the nested message', message.data);
          
            if (message.type === 'initialData') {
                const {username, currentCells, story} = message.data;
                console.log('Initial data:', {username, currentCells, story});
                this.username = username;
                this.currentCells = currentCells || []; 
                
                // Set words from currentCells before creating grid
                this.words = this.currentCells.map(cell => cell.word);
                
                // Create grid after setting words
                this.createGrid();
                this.addEventListeners();
                
                this.updateGridFromGameState();
                
                // Update story
                this.storyElement.innerText = story || '';
            } 
            if (message.type === 'updateGameCells') {
                console.log("reached inside updateGameCells if statement")
                const {currentCells, gameRound} = message.data;
                console.log('Update game cells:', currentCells);
                this.currentCells = currentCells || [];
                this.gameRound = gameRound !== undefined ? gameRound : this.gameRound + 1;
                this.updateGridFromGameState();
                this.updateGameRoundDisplay();
            }

            if(message.type === 'updateTextField'){
              console.log("Received story update message", message.data);
              this.updateTextField(message.data);
            }
           }
          } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    this.channel.onmessage = (event) => {
      if (event.data) {
        switch (event.data.type) {
          case 'updateCells':
            console.log('Received cell update:', event.data.cells);
            this.currentCells = event.data.cells;
            this.updateGridFromGameState();
            break;
          case 'storyUpdate':
            console.log('Received story update via channel:', event.data);
            // Support both direct story and word+story formats
            const storyToDisplay = event.data.story || 
                                   (event.data.word ? `${this.storyElement.innerText} ${event.data.word}` : '');
            this.storyElement.innerText = storyToDisplay.trim();
            break;
          case 'gameOver':
            console.log('Game over received:', event.data);
            this.currentCells = [{ word: 'GAME OVER', userCount: 0 }];
            this.updateGridFromGameState();
            break;
        }
      }
    };
  }

  // Create the grid of words
  createGrid() {
      this.gridContainer.innerHTML = ''; 

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

      // Increment game round if signaled
      if (data.incrementRound) {
        this.gameRound++;
        this.updateGameRoundDisplay();
      }
    }
  }
  updateGridFromGameState() {
    console.log('Updating grid with cells:', JSON.stringify(this.currentCells));
    
    // Clear existing grid
    this.gridContainer.innerHTML = '';
    
    // Recreate grid with new cells
    this.words = this.currentCells.map(cell => 
      typeof cell === 'string' ? cell : cell.word
    );
    
    // Check for game over
    if (this.words.length === 1 && this.words[0] === 'GAME OVER') {
      this.showGameOverScreen();
      return;
    }
    
    this.createGrid();
    
    document.querySelectorAll(".cell").forEach(cell => {
        const word = cell.dataset.word;
        
        const cellData = this.currentCells.find(c => {
          if (typeof c === 'string') return c === word;
          return c.word === word;
        });
        
        if (cellData) {
            const userCount = typeof cellData === 'string' 
              ? 0 
              : (cellData.userCount || 0);
            
            let color;
            
            if (userCount <= 2) {
                color = '#90EE90'; // Light green
            } else if (userCount <= 5) {
                color = '#32CD32'; // Medium green
            } else {
                color = '#40c632'; // Dark green
            }
            
            cell.style.backgroundColor = color;
            cell.dataset.userCount = userCount.toString();
            
            const playerCountEl = cell.querySelector('.cell-players');
            if (playerCountEl) {
                playerCountEl.textContent = userCount > 0 ? `+${userCount}` : '';
            }
        }
    });
  }

  updateGameRoundDisplay() {
    // Create or update game round display
    let gameRoundEl = document.getElementById('game-round');
    if (!gameRoundEl) {
      gameRoundEl = document.createElement('div');
      gameRoundEl.id = 'game-round';
      gameRoundEl.classList.add('game-round');
      document.getElementById('game-container').prepend(gameRoundEl);
    }
    console.log('Updating game round display:', this.gameRound);
    gameRoundEl.textContent = `Round: ${this.gameRound}`;
  }

  showGameOverScreen() {
    // Create a game over overlay
    const gameOverOverlay = document.createElement('div');
    gameOverOverlay.id = 'game-over-overlay';
    gameOverOverlay.innerHTML = `
      <div class="game-over-content">
        <h1>Game Over</h1>
        <p>Final Round: ${this.gameRound}</p>
        <p>Final Story: ${this.storyElement.innerText}</p>
        <button id="restart-game">Play Again</button>
      </div>
    `;
    
    // Style the overlay
    gameOverOverlay.style.position = 'fixed';
    gameOverOverlay.style.top = '0';
    gameOverOverlay.style.left = '0';
    gameOverOverlay.style.width = '100%';
    gameOverOverlay.style.height = '100%';
    gameOverOverlay.style.backgroundColor = 'rgba(0,0,0,0.7)';
    gameOverOverlay.style.display = 'flex';
    gameOverOverlay.style.justifyContent = 'center';
    gameOverOverlay.style.alignItems = 'center';
    gameOverOverlay.style.zIndex = '1000';
    
    // Add to body
    document.body.appendChild(gameOverOverlay);
    
    // Add restart game listener
    document.getElementById('restart-game').addEventListener('click', () => {
      // Notify parent to restart the game
      window.parent?.postMessage({
        type: 'restartGame'
      }, '*');
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

    document.getElementById("checkAnswer").addEventListener("click", () => {
      try {
        // Get all selected cells
        const selectedCells = Array.from(document.querySelectorAll(".cell.selected"))
          .map(cell => cell.dataset.word)
          .filter(Boolean);

        if (selectedCells.length === 0) return;

        // Notify Devvit to sync state with ONLY the newly selected cells
        window.parent?.postMessage({
          type: 'saveCells',
          data: {
            newCells: selectedCells,
            session: Math.random().toString(36).substring(2) // Generate a unique session ID
          }
        }, '*');
        
        // Vote for selected words
        selectedCells.forEach(word => {
          window.parent?.postMessage({
            type: 'voteWord',
            data: { word }
          }, '*');
        });
        
        // Start 30-second timer after confirm
        let lastSelectedTime = Date.now();
        setTimeout(() => {
          // Clear selections after 30 seconds
          document.querySelectorAll(".cell.selected").forEach(cell => {
            cell.classList.remove("selected");
          });
        }, 30000);

      } catch (error) {
        console.error('Error processing selection:', error);
      }
    });


  }

  arraysMatch(arr1, arr2) {
    if (arr1.length !== arr2.length) return false;
    return arr1.every(word => arr2.includes(word));
  }
}


// Initialize game
new WordGuesserGame();
