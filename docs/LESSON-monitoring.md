# Урок: Диагностика и мониторинг SaaS-приложения

## Что произошло

Пользователь сообщил: "сервис перестал загружаться". При этом:
- Все сервисы были запущены
- API отвечал корректно
- Проблема была на стороне клиента

## Корневая причина

**Кэш браузера** — после пересборки frontend изменились JS-чанки, но браузер загружал старые файлы из кэша.

## Цепочка диагностики

### 1. Проверка сервисов
```bash
systemctl status landsearch-backend landsearch-frontend
```
→ Оба сервиса `active (running)`

### 2. Проверка API
```bash
curl -sk https://v3163460.hosted-by-vdsina.ru/health
```
→ `{"status": "ok", "services": {"postgres": "ok", "redis": "ok"}}`

### 3. Проверка данных
```bash
curl -sk "https://v3163460.hosted-by-vdsina.ru/api/v1/plots/geo?bbox=48.0,54.0,54.0,56.5" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['features']))"
```
→ `253` (данные загружаются)

### 4. Проверка nginx
```bash
tail -20 /var/log/nginx/error.log
```
→ Ошибки `Connection refused` были только при рестарте (ожидаемо)

### 5. Проверка SSL
```bash
curl -svk https://v3163460.hosted-by-vdsina.ru/ 2>&1 | grep "SSL connection"
```
→ `SSL connection using TLSv1.3` (сертификат валиден)

### 6. Проверка статического контента
```bash
curl -sk https://v3163460.hosted-by-vdsina.ru/_next/static/chunks/app/page-*.js -o /dev/null -w "%{http_code}"
```
→ `200` (файлы доступны)

## Что было сделано

### Добавлен мониторинг

1. **Prometheus метрики** (`app/metrics.py`):
   - `landsearch_requests_total` — количество запросов
   - `landsearch_request_duration_seconds` — латентность
   - `landsearch_cache_hits_total/misses_total` — статистика кэша

2. **Мониторинг скрипт** (`scripts/monitor.py`):
   - Проверяет все сервисы
   - Измеряет время отклика API
   - Проверяет количество участков

3. **Логирование запросов** (`app/core/middleware.py`):
   - Request ID для трассировки
   - Время обработки каждого запроса
   - HTTP статус коды

### Как использовать

```bash
# Быстрая проверка всех сервисов
python3 scripts/monitor.py

# Prometheus метрики (только с localhost)
curl http://127.0.0.1:8000/metrics

# Логи nginx
tail -f /var/log/nginx/access.log

# Логи backend
journalctl -u landsearch-backend -f
```

## Правила предотвращения

### 1. Версионирование статики
```nginx
location /_next/static/ {
    expires 365d;
    add_header Cache-Control "public, immutable, max-age=31536000";
}
```
Next.js автоматически добавляет хэш в имена файлов (`page-0055ccfe77253d1a.js`).

### 2. Принудительная инвалидация кэша
При деплое:
```bash
cp -r .next/static .next/standalone/.next/static
cp .next/BUILD_ID .next/standalone/.next/BUILD_ID
systemctl restart landsearch-frontend
```

### 3. Мониторинг деплоя
```bash
# После деплоя проверять:
python3 scripts/monitor.py

# Ожидаемый результат:
# Frontend:       OK
# Backend:        OK
# API /plots/geo: OK (XXXms)
# Plots loaded:   NNN
```

## Чек-лист при проблемах

| Проблема | Команда проверки |
|----------|------------------|
| Сервис не запущен | `systemctl status <service>` |
| API не отвечает | `curl http://127.0.0.1:8000/health` |
| БД недоступна | `pg_isready -h localhost` |
| Redis недоступен | `redis-cli ping` |
| nginx блокирует | `tail -f /var/log/nginx/error.log` |
| SSL истёк | `openssl s_client -connect host:443` |
| Кэш браузера | `Ctrl+Shift+R` или инкогнито |
| CSP блокирует | DevTools → Console → ошибки CSP |

## Метрики для алертов

```bash
# Время ответа API > 5 секунд
curl -sk https://host/health -o /dev/null -w "%{time_total}\n"

# Количество участков = 0 (данные потеряны)
curl -sk "https://host/api/v1/plots/geo?bbox=48,54,54,57" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['features']))"

# Ошибки 5xx в nginx
grep " 5[0-9][0-9] " /var/log/nginx/access.log | wc -l
```

## Публикация карты LandScanner

Карта КП «Корнер Брайт» генерируется офлайн через LandScanner и не запускает
сканирование НСПД во время открытия страницы.

```bash
install -d -o landscanner -g landscanner /var/lib/landscanner/artifacts/corner-bright
curl -fsS https://v3163460.hosted-by-vdsina.ru/api/v1/settlements/eafe5fc4-165f-421e-aa79-3ae786458627 \
  | /opt/landscanner/venv/bin/python -c 'import json, sys; print(json.dumps(json.load(sys.stdin)["geometry"]))' \
  > /var/lib/landscanner/artifacts/corner-bright/boundary.geojson
cd /var/lib/landscanner/artifacts/corner-bright
runuser -u landscanner -- /opt/landscanner/venv/bin/python /opt/landscanner/app/deploy/generate_one.py \
  'Корнер Брайт' --boundary-file boundary.geojson
bash /root/landsearch/scripts/publish-landscanner-map.sh \
  settlement_корнер_брайт_map.html /var/www/landsearch/settlement-maps/corner-bright/full_map.html
curl -fsSI https://v3163460.hosted-by-vdsina.ru/settlements/eafe5fc4-165f-421e-aa79-3ae786458627/map
```

Проверка после публикации: ответ карты `200`, HTML не содержит `unpkg.com`, а
страница содержит слои `plots-cad-suffix` и `cadastral-quarters`.
