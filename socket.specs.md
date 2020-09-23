# game socketio specs v0.0.1

## Create game: `game.create`

### client:

#### emit("game.create"):

- on click "create game"
- show spinner after clicking

#### on("game.join", (gameObj) => {...}):

- gameObj defn:
  ```
  gameObj: {
    gameCode,  <- game gameCode
    host,      <- host cId, which is you
    phase,     <- should be "lobby" now
    players: { <- a mapping of (cId, their current game state)
      cId: {
        answers[],
        score
        status <- online/offline
      }
    }
  }
  ```
- proceed to GameController screen, whose current screen is set to `phase` (which should = "lobby" for now)
- when in the lobby screen of GameController, check if your `cId == gameObj.host` for conditional rendering of host-only components e.g. ability to add question packs. If `cId != gameObj.host` (the case for players who are !host), then show them non-host stuff.

## Join game: `game.join`

### client:

#### emit("game.join", { gameCode: ... }):

- on click "join game" or on visit URL with "gameCode=..." query param
- show spinner after clicking/visiting

#### on("game.join", (gameObj) => {...}):

- gameObj defn:
  ```
  gameObj: {
    gameCode,  <- game gameCode
    host,      <- host cId, which is you
    phase,
    players: { <- a mapping of (cId, their current game state). It should contain your cId because you just joined
      cId: {
        answers[],
        score
        status <- online/offline
      }
    }
  }
  ```
- proceed to GameController screen, whose current screen is set to `phase`.

## Leave game: `game.leave`

### client:

#### on("game.leave"):

- triggered when the client EXPLICITLY clicks leave game (not when he refreshes the page)
- take him back to the home screen

## Game join event: `game.event.join`

**Note:** Events prefixed with `game.event` will be the events within the actual game itself, unlike `game.join`, `game.create`, and `game.leave` which are dealing with the entry/exit of the current user to the game. So `game.join` means you're entering the game whereas `game.event.join` means you're in the game and someone else is joining the game.

### client:

#### on("game.event.join", (player) => { ... })

- server emits this when a new player has joiend the game (clicked the join game/visit URL with gameCode)
- update list of players in the game i.e. `players[player.cId] = player`. Don't care if cId is duplicated in the player object for now (forever).

#### on("game.event.leave", (player) => { ... })

- server emits this when a player has left the game (clicked the exit game)
- update list of players in the game i.e. `setPlayers((prev) => { ...prev, [player.cId]: null })`; everyone retains their player object except the player who just left
