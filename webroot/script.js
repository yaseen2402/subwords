class WordGuesserGame {
  constructor() {
      this.words = [
          "APPLE", "BERRY", "CHESS", "DAISY", "EAGLE",
          "SUSAMONGUS", "GIANT", "HONEY", "IRONY", "JOKER",
      ];
      this.story = "";
      this.gridContainer = document.getElementById("grid");
      this.message = document.getElementById("message");
      
      this.postId = null;
      this.username = 'Guest';
      this.cellSelections = {};
      this.currentCells = []; 

      this.channel = new BroadcastChannel('game_updates');

      this.initGame();
  }

  // Initialize game
  initGame() {
    this.storyElement = document.getElementById("story");
    this.createGrid();
    this.addEventListeners();
    
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
                this.updateGridFromGameState();
                
                // Update story
                this.storyElement.innerText = story || '';
            } 
            if (message.type === 'updateGameCells') {
                console.log("reached inside updateGameCells if statement")
                const {currentCells} = message.data;
                console.log('Update game cells:', currentCells);
                this.currentCells = currentCells || [];
                this.updateGridFromGameState();
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
            this.currentCells = event.data.cells;
            this.updateGridFromGameState();
            break;
          case 'storyUpdate':
            this.storyElement.innerText = event.data.story;
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

  updateGridFromGameState() {
    console.log('Updating grid with cells:', JSON.stringify(this.currentCells));
    
    document.querySelectorAll(".cell").forEach(cell => {
        const word = cell.dataset.word;
        
        // More robust cell data finding with extensive logging
        const cellData = this.currentCells.find(c => {
          // Extensive type checking and logging
          console.log('Checking cell:', c, 'against word:', word);
          
          if (typeof c === 'string') {
            console.log('String match:', c === word);
            return c === word;
          }
          
          if (typeof c === 'object' && c !== null) {
            console.log('Object match:', c.word === word, 'c.word:', c.word);
            return c.word === word;
          }
          
          console.log('No match for cell:', c);
          return false;
        });
        
        if (cellData) {
            console.log('Found cell data:', cellData);
            
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
            
            // Update user count display
            const playerCountEl = cell.querySelector('.cell-players');
            if (playerCountEl) {
                playerCountEl.textContent = userCount > 0 ? `+${userCount}` : '';
            }
            
            console.log(`Marking ${word} as ${color} with ${userCount} users`);
        } else {
            console.log(`No cell data found for word: ${word}`);
        }
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

    // Story input event listener
    document.getElementById("storyInput").addEventListener("change", (event) => {
      const storyText = event.target.value;
      window.parent?.postMessage({
        type: 'saveStory',
        data: { story: storyText }
      }, '*');
    });
  }

  arraysMatch(arr1, arr2) {
    if (arr1.length !== arr2.length) return false;
    return arr1.every(word => arr2.includes(word));
  }
}


// Initialize game
new WordGuesserGame();
