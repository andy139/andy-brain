Send a URL to Discord via webhook so you can tap it on your phone.

**Usage:** `/save <url>`

Run the following bash command to POST the URL to Discord:

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"$ARGUMENTS\"}" \
  "$DISCORD_WEBHOOK_URL"
```

If the response is `204`, confirm to the user: "Saved to Discord: $ARGUMENTS"

If the response is anything else (or if `DISCORD_WEBHOOK_URL` is not set), tell the user it failed and show the status code.
