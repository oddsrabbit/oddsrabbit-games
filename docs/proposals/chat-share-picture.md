# Sending a picture to a chat: `chat.sharePicture`

Status: built 2026-10-22, not deployed. The SDK has the verb (schema,
`OR.chat.sharePicture`, tests in `src/sdk/pictures.test.ts`). Rabbit Paint shows
**Send in chat** on its share sheet when a host lists `chat.sharePicture`, and
its harness fakes the picker. WP needed nothing new: both hosts upload through
the existing `POST /chat/upload-image` and send an image message, with the
caption as a second text message. The web host (`games.js`) and the app
(`AppHost.tsx`, `SharePictureSheet.tsx`) have their own picker of recent chats.
Not done from the plan below: the `bridge:share` check, the "from Rabbit
Paint" link on the bubble, and people search in the picker.

## Why

A player who colored a page wants to show one friend, in the OddsRabbit chat
they already use. `actions.share` only carries text, and inside the app's
WebView the Web Share API usually can't send files, so today the picture never
leaves the game there. Any game that makes something visual (Rabbit Paint, a
pet's photo, a finished board) can use the same verb.

## The verb

`chat.sharePicture` `{ image, caption? }` → `{ sent }`.

- `image`: a `data:image/png` or `data:image/jpeg` base64 URL, at most
  `PICTURE_MAX_BYTES` (2 MB) decoded. Games scale to 1600 px on the long side.
- `caption`: optional, at most 200 characters. The host may let the player
  edit it before sending.
- The **host** shows its own chat picker (recent chats, then people the player
  follows). The game never learns who it went to. `{ sent: false }` when the
  player closes the picker; that is not an error.
- Signed in only. Needs the `bridge:share` scope.

Errors (`CHAT_ERROR_CODES`, none of them retire the verb):
`chat/unauthorized` (guest), `chat/invalid-image` (not PNG/JPEG, too big,
undecodable), `chat/rate-limited` (say 20 a minute). Anything else shows
"couldn't send it".

## Server (WP)

- An image message type in Chat if there isn't one: the message stores an
  attachment id, not the image inline.
- Upload: decode, check it's a real PNG/JPEG under 2 MB, re-encode (strips
  metadata), store under the chat attachments path with the same access rules
  as other chat media.
- The message carries the game: `app slug` + title, so the chat bubble can
  say "from Rabbit Paint" and link to the game.
- Rate limit per sender; the erasure manifest covers the files with the rest
  of the user's chat media.

## Hosts

- **App** (`AppHost.tsx`): add `chat.sharePicture` to `HOST_CAPABILITIES`, a
  case in the bridge switch that opens the native chat picker sheet with the
  picture, uploads on pick, posts the message, and answers `{ sent }`.
- **Web host** (`games.js`): the same with the web chat picker.
- **Sandbox host** (`src/host/host.ts`): relays it already (it relays every
  verb in the schema).

Deploy order: WP (message type, upload route), then the SDK dist, then the web
host and the app. A game gates the button on the capability, so the order of
the last two doesn't matter.

Bridge size: a 2 MB data URL through postMessage and the React Native WebView
bridge needs a test on a low-end Android device (as for `content.submit`).

## Open questions

- Should a picture go to group chats too, or only one-to-one?
- Moderation: an image in a one-to-one chat is between friends, but report
  and block must work on image messages like on text.
