# Быстрый мониторинг — шпаргалка

## Проверка всех сервисов
```bash
python3 /root/landsearch/backend/scripts/monitor.py
```

## Проверка по отдельности

| Сервис | Команда |
|--------|---------|
| Backend | `curl -s http://127.0.0.1:8000/health` |
| Frontend | `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000` |
| PostgreSQL | `pg_isready -h localhost -U landsearch` |
| Redis | `redis-cli ping` |
| nginx | `systemctl status nginx` |

## Логи

```bash
# Backend (uvicorn)
journalctl -u landsearch-backend -f --no-pager

# Frontend (next.js)
journalctl -u landsearch-frontend -f --no-pager

# nginx access
tail -f /var/log/nginx/access.log

# nginx errors
tail -f /var/log/nginx/error.log

# NSPD сканирование
journalctl -u landsearch-refresh -f
```

## API метрики

```bash
# Время ответа
curl -sk https://v3163460.hosted-by-vdsina.ru/ -o /dev/null -w "time: %{time_total}s\n"

# Количество участков
curl -sk "https://v3163460.hosted-by-vdsina.ru/api/v1/plots/geo?bbox=48,54,54,57" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['features']))"

# Prometheus (только с сервера)
curl http://127.0.0.1:8000/metrics | grep "landsearch_"
```

## Решение проблем

| Симптом | Решение |
|---------|---------|
| Страница не грузится | `Ctrl+Shift+R` или инкогнито |
| 502 Bad Gateway | `systemctl restart landsearch-backend` |
| Нет данных на карте | `python3 scripts/scan_kazan.py` |
| Медленная загрузка | Проверить размер bbox, уменьшить |
| Ошибки CSP | DevTools → Console → посмотреть что блокируется |
