# Game socket.io specifications v0.0.5

Below you will find a list of event endpoints, the schema of the payload they expect, and some descriptions.

# Table of Content

- [Meta-game](#meta-game)
  - [game.create](#gamecreate)
  - [game.join](#gamejoin)
  - [game.leave](#gameleave)
- [Within the game](#within-the-game)
  - [game.event.chat](#gameeventchat)
  - [game.event.questions.update](#gameeventquestionsupdate)
  - [game.event.host.start](#gameeventhoststart)
  - [game.event.host.playAgain](#gameeventhostplayagain)
  - [game.event.player.answer](#gameeventplayeranswer)

# Meta-game

## game.create

### Payload:

The payload is a js object with the following keys:

- **name:** name that the player has chosen.
- **iconNum:** number of the icon the player has chosen.

### Description:

When server receives message from this endpoint from a socket client, it creates a game room with a randomly generated gameCode and assign the sending socket's cId (client id) to be the host. It retrieves the cId from the socket object.

### Server response:

#### Success:

Server emits to the client "game.join" with the gameObject as payload, which tells the client to join the game it just created.

#### Error:

Server emits to the client "game.join.error".

## game.join

### Payload:

The payload is a js object with the following keys:

- **gameCode:** code of the game the player wishes to join.
- **name:** name that the player has chosen.
- **iconNum:** number of the icon the player has chosen.

### Description:

When server receives message from this endpoint from a socket client, it will attempt to add the client to the game based on gameCode client specified.

### Server response:

#### Success:

Server emits "game.join" to the client with gameObject as payload. Server emits to everyone in the game room (except client) "game.event.player.join" with the client's playerObject.

#### Error:

Server emits "game.join.error" with payload "No such game exists." to the client if no game specified by the gameCode exists. If some other error, then just "game.join.error" with no payload.

## game.leave

### Payload:

The payload is a js object with the following keys:

- **gameCode:** code of the game the player wishes to leave.

### Description:

When server receives message from this endpoint from a socket client, it will remove this socket from the game specified by gameCode.

### Server response:

#### Success:

Server emits "game.leave" to the client, signalling that it has succesfully left a game. Server will emit "game.event.player.leave" with payload playerObject (of the client who just left) to all socket clients in the game room.

#### Error:

Server emits "game.leave.error" to the client with no payload.

# Within the game

## game.event.chat

### Payload:

The payload is a js object with the following keys:

- **gameCode:** code of the game the player wishes to chat in.
- **message:** the player's chat message.

### Description:

When server receives message from this endpoint from a socket client, it will broadcast the message sent by the client to all clients in the game room specified by gameCode.

### Server response:

#### Success:

Server emits "game.event.chat" to everyone in the game room specified by gameCode.

#### Error:

Server emits "game.kick" to the client if no game specified by gameCode exists as it could be that the game room has expired. Otherwise, it emits "game.event.chat.error" to the client.

## game.event.questions.update

### Payload:

The payload is a js object with the following keys:

- **gameCode:** code of the game the player wishes update the questions of.
- **questions:** array of questions to update with.

### Description:

When server receives message from this endpoint from a socket client, it will attempt to update the list of questions in this game specified by gameCode.

### Server response:

#### Success:

Server emits "game.event.questions.update" with list of questions as payload to everyone in the game room specified by gameCode.

#### Error:

Server emits "game.kick" to the client if no game specified by gameCode exists as it could be that the game room has expired. Otherwise, it emits "game.event.questions.update.error" to the client.

## game.event.host.start

### Payload:

The payload is a js object with the following keys:

- **gameCode:** code of the game the player (host) wishes to start.

### Description:

When server receives message from this endpoint from a socket client, it will attempt to start the game specified by gameCode.

### Server response:

#### Success:

Server emits "game.event.transition" with the gameObject to all clients in the game room. Each client gets their own version which tells them if they are the answerer/guesser for that round. Information about other clients' role is hidden.

#### Error:

Server emits "game.kick" to the client if no game specified by gameCode exists as it could be that the game room has expired. Otherwise, it emits "game.event.host.start.error" to the client.

## game.event.host.playAgain

### Payload:

The payload is a js object with the following keys:

- **gameCode:** code of the game (that has ended) the player (host) wishes to restart from lobby phase.

### Description:

When server receives message from this endpoint from a socket client, it will attempt to restart the (ended) game specified by gameCode.

### Server response:

#### Success:

Server emits "game.event.transition" with the gameObject to all clients in the game room.

#### Error:

Server emits "game.kick" to the client if no game specified by gameCode exists as it could be that the game room has expired. Otherwise, it emits "game.event.host.start.error" to the client.

## game.event.player.answer

### Payload:

The payload is a js object with the following keys:

- **gameCode:** code of the game the player (answerer/guesser) wishes to submit their answer to.
- **answer:** the player's answer.

### Description:

When server receives message from this endpoint from a socket client, it will attempt to register the client's answer for the given round and phase of the game.

### Server response:

#### Success (if PHASE_QN_ANSWER):

Once answerer has answered, server emits "game.event.transition" with a partial gameObject as payload to all clients.

#### Success (if PHASE_QN_GUESS):

If all clients have answered or if ROUND_TIMER_1 ms passes, whichever sooner, server emits "game.event.transition" with a partial gameObject to all clients in the game room.

#### Error:

Server emits "game.kick" to the client if no game specified by gameCode exists as it could be that the game room has expired. Otherwise, it emits "game.event.player.answer.error" to the client.
