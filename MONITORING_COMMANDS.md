# Monitoring Commands

Useful Docker commands for checking API and OCR errors on the production droplet.

## Live logs

### OCR service
```bash
docker logs -f zentra-image-extractor-production
```

### Backend API
```bash
docker logs -f zentra-api-production
```

### Both together
```bash
docker compose -f docker-compose.prod.yml logs -f zentra-api-production zentra-image-extractor-production
```

## Recent logs

### Last 200 OCR lines
```bash
docker logs --tail 200 zentra-image-extractor-production
```

### Last 200 API lines
```bash
docker logs --tail 200 zentra-api-production
```

## Filter likely failures

### OCR errors, exceptions, traceback, or Sentry
```bash
docker logs --tail 300 zentra-image-extractor-production 2>&1 | grep -Ei "error|exception|traceback|sentry"
```

### API errors, receipt, OCR, or Sentry
```bash
docker logs --tail 300 zentra-api-production 2>&1 | grep -Ei "error|exception|receipt|ocr|sentry"
```

## Check runtime env vars

### OCR Sentry env
```bash
docker exec -it zentra-image-extractor-production env | grep SENTRY
```

### API Sentry env
```bash
docker exec -it zentra-api-production env | grep SENTRY
```

## Check container status

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

## Notes

- OCR container name: `zentra-image-extractor-production`
- API container name: `zentra-api-production`
- If the frontend reports a `500` on receipt scan, check both OCR and API logs together first.
