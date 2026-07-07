# Williams Facebook Lister License Bot

## Render setup
1. Upload these files to GitHub directly. Do **not** upload the ZIP only.
2. On Render, create a **Web Service** from this repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables:
   - `DISCORD_TOKEN` = your Discord bot token
   - `CLIENT_ID` = your Discord application/client ID
   - `GUILD_ID` = your Discord server ID
   - `API_SECRET` = any private random password, like `wfl-secret-123`

## Discord commands
- `/key-create duration:30d`
- `/key-create duration:lifetime`
- `/key-revoke key:WFL-XXXXXX-XXXXXX`
- `/key-info key:WFL-XXXXXX-XXXXXX`
- `/key-list`

## API endpoint
POST `/api/validate`

```json
{
  "key": "WFL-XXXXXX-XXXXXX",
  "deviceId": "computer-id",
  "apiSecret": "same-as-API_SECRET"
}
```
