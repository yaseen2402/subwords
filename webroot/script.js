class WordGuesserGame {
  constructor() {
      this.words = [
          "APPLE", "BERRY", "CHESS", "DAISY", "EAGLE",
          "SUSAMONGUS", "GIANT", "HONEY", "IRONY", "JOKER",
          "KNEEL", "LUNCH", "MONEY", "NIGHT", "OASIS",
          "PAPER", "QUIRK", "ROBIN", "CONSTANTINOPLE", "TIGER",
          "UNITY", "VIVID", "WORRY", "XENON", "YEARN",
      ];
      this.correctWords = ["APPLE", "MONEY", "PAPER"]; 
      this.hint = "material things";
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
    document.getElementById("hint").innerText = this.hint;
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
                const {username, currentCells} = message.data;
                console.log('Initial data:', {username, currentCells});
                this.username = username;
                this.currentCells = currentCells || []; 
                this.updateGridFromGameState();

            } 
            if (message.type === 'updateGameCells') {
                console.log("reached inside updateGameCells if statement")
                const {currentCells} = message.data;
                console.log('Update game cells:', currentCells);//we need to see this 
                this.currentCells = currentCells || [];
                this.updateGridFromGameState();
            }

           }
          } catch (error) {
            console.error('Error processing message:', error);
        
      }
    });

    this.channel.onmessage = (event) => {
      if (event.data && event.data.type === 'updateCells') {
        this.currentCells = event.data.cells;
        this.updateGridFromGameState();
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
    console.log('Updating grid with cells:', this.currentCells);
    
    document.querySelectorAll(".cell").forEach(cell => {
        const word = cell.dataset.word;
        
        const cellData = this.currentCells.find(c => 
          typeof c === 'string' ? c === word : c.word === word
        );
        
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
                color = '#006400'; // Dark green
            }
            
            cell.style.backgroundColor = color;
            cell.dataset.userCount = userCount.toString();
            
            // Update user count display
            const playerCountEl = cell.querySelector('.cell-players');
            if (playerCountEl) {
                playerCountEl.textContent = userCount > 0 ? `${userCount} users` : '';
            }
            
            console.log(`Marking ${word} as ${color} with ${userCount} users`);
        }
    });
  }


  // Add event listeners for word selection
  addEventListeners() {
    this.gridContainer.addEventListener("click", (event) => {
      const cell = event.target.closest(".cell");
      if (cell) {
        // Toggle selection with animation
        cell.classList.toggle("selected");
        
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

        // Update local state
        this.currentCells = [...new Set([...this.currentCells, ...selectedCells])];
        
        // Clear selections
        document.querySelectorAll(".cell.selected").forEach(cell => {
          cell.classList.remove("selected");
        });

        // Notify Devvit to sync state
        window.parent?.postMessage({
          type: 'saveCells',
          data: {
            newCells: this.currentCells,
            session: Math.random().toString(36).substring(2) // Generate a unique session ID
          }
        }, '*');

        this.updateGridFromGameState();

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
