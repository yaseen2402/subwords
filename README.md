
# Substory: A Multiplayer Word Game

Substory is a collaborative and interactive word game designed for Reddit users. By leveraging user-generated content from popular subreddits, the game presents trending words that players vote on to build an interesting story. As players contribute their choices, AI seamlessly integrates phrases and sentences to bridge the selected words, ensuring a smooth, logical, and engaging narrative progression.

## How to Play

1. **Start the Game**: Each game is hosted in a dedicated Reddit post, representing one story. Hence a new post needs to be created for each game session.

2. **Round Structure**:
   - The game consists of **4 rounds**, with each round contributing to the evolving story.
   - In the **first round**, Substory fetches 8 words being actively discussed in popular subreddits. These words appear on the screen as options for players.
   - Players vote for their favorite word among the options.
   - Every **30 seconds**, the word with the most votes is added to the story.
   - After the chosen word is added, an AI generates appropriate connectors to ensure the story remains coherent.
   - Sometimes the game may go into overtime in case no user has voted on any of the words, the game will proceed to next round only if there is atleast one vote on a word which can then be added to the story 

3. **Subsequent Rounds**:
   - In each subsequent round, the word options presented are contextually relevant to the existing story.
   - Players vote again, and the process repeats, with the AI adding connectors after each round.

4. **Game Progression**:
   - This cycle continues for 5 rounds, progressively building the story.
   - After the final round, the complete story is framed and added to the same Reddit post.

5. **View Past Stories**:
   - Each completed story is preserved in its respective post, allowing players and visitors to browse and enjoy previous creations.

## Features
- **Real-Time Voting**: Players collaboratively decide the direction of the story through voting.
- **Dynamic Word Choices**: The initial round draws from trending words across subreddits, while subsequent rounds adapt to the story’s context.
- **AI Integration**: Ensures that the story remains coherent and engaging by adding connectors between user-selected words.
- **Community Interaction**: Builds stories that reflect collective creativity and popular trends.

Substory is an innovative way to bring the Reddit community together through storytelling. Join the fun and see where your words take the story!
