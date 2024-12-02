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
      this.cellSelections = {};
      this.currentCells = []; 

      // this.channel = new BroadcastChannel('game_updates');

      this.initGame();
  }

  // Initialize game
  initGame() {
    document.getElementById("hint").innerText = this.hint;
    this.createGrid();
    this.addEventListeners();
    
    // handling messages sent from devvit app 
    window.addEventListener('message', (event) => {
        try {
          const { type, data} = event.data;
          
          if(type=='devvit-message'){
            const{message} = data;
          
            if (message.type === 'initialData') {
                const {username, currentCells} = message.data;
                this.username = username;
                this.currentCells = currentCells || []; 
                this.updateGridFromGameState();

            } 
            if (message.type === 'updateGameCells') {
                const {currentCells} = message.data;
                this.currentCells = currentCells;
                this.updateGridFromGameState();
            }
           }
          } catch (error) {
            console.error('Error processing message:', error);
        
      }
    });

    // this.channel.onmessage = (event) => {
    //   if (event.data && event.data.type === 'updateCells') {
    //     this.currentCells = event.data.cells;
    //     this.updateGridFromGameState();
    //   }
    // };
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
    // Update grid based on game state
    document.querySelectorAll(".cell").forEach(cell => {
        const word = cell.dataset.word;
        // const playerCountEl = cell.querySelector('.cell-players');
        
        if(this.currentCells.includes(word)|| this.cellSelections[word]){
          cell.style.backgroundColor = 'green';
        }
        
         else {
            cell.style.backgroundColor = '';
            // playerCountEl.textContent = '';
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
      try{
        const selectedCells = Array.from(document.querySelectorAll(".cell.selected"))
            .map(cell => ({ 
              word: cell.dataset.word, 
              id: parseInt(cell.dataset.id, 10) 
          }));
        
        // Update cell selections
        selectedCells.forEach(({word}) => {
          this.cellSelections[word] = { [this.username]: true };
      });

        // Add user's selections to game state
        // this.gameState.userSelections = this.username;

      //   const isCorrect = this.arraysMatch(
      //     selectedCells.map(item => item.word), 
      //     this.correctWords
      // );

        // if (isCorrect) {
        //     this.message.style.color = "#4caf50";
        //     this.message.innerText = `Congratulations, ${this.username}! You found the correct words!`;
        // } else {
        //     this.message.style.color = "#d32f2f";
        //     this.message.innerText = "Try again!";
        // }

        // Save state and notify Devvit
        window.parent?.postMessage({
            type: 'saveCells',
            data: { 
              newCells: [...new Set([...(this.currentCells || []), ...selectedCells.map(cell=>cell.word)])], 
            }
        },'*'
      );
        this.updateGridFromGameState();
        console.log("sent game data from webview to devvit")

      }catch(error){
        console.error('Error sending data from webview to devvit', error);
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
