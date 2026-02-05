# Backend Logs

This directory contains structured logs for the Ansuz Tools backend server.

## Log Files

- **combined.log**: Contains all log messages (info, warn, error, debug)
- **error.log**: Contains only error messages for quick troubleshooting

## Log Format

All logs are stored in JSON format with the following structure:

```json
{
  "level": "info",
  "message": {
    "action": "action_name",
    "timestamp": "2026-02-05T11:39:55.356Z",
    "userId": 1,
    "...": "additional context"
  },
  "timestamp": "2026-02-05 11:39:55"
}
```

## Log Levels

- **ERROR**: Errors that need immediate attention
- **WARN**: Warnings about potential issues
- **INFO**: General operational messages
- **DEBUG**: Detailed debugging information (only in development)

## Rotation

Log files are automatically rotated when they reach 10MB in size, keeping the last 5 files.

## Example Log Entries

### HTTP Request
```json
{
  "action": "http_request",
  "method": "PUT",
  "path": "/api/stock-predictions/1",
  "statusCode": 200,
  "duration": "4ms",
  "ip": "::1"
}
```

### Stock Prediction Update
```json
{
  "action": "update_stock_prediction",
  "userId": 1,
  "predictionId": "1",
  "requestBody": {
    "predictionDate": "2024-01-20",
    "predictedChange": "up",
    "actualChange": "up"
  }
}
```

### Error Example
```json
{
  "action": "update_stock_prediction_error",
  "error": "Database error message",
  "stack": "Error stack trace...",
  "userId": 1,
  "predictionId": "1"
}
```

## Viewing Logs

To view recent logs:
```bash
tail -f logs/combined.log
```

To view only errors:
```bash
tail -f logs/error.log
```

To search for specific actions:
```bash
grep "update_stock_prediction" logs/combined.log
```

To parse and view logs in a readable format:
```bash
cat logs/combined.log | jq '.'
```
