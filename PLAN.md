# LandSearch — План сервиса

## 1. Концепция

**LandSearch** — SaaS-платформа для поиска, продажи и анализа земельных участков в РФ.
Аналог ЦИАН, но специализированный под землю (ИЖС, ЛПХ, СНТ, ДНП, коммерция).

Интеграция с **Росреестр, НСПД, ПКК (Публичная кадастровая карта), ГИС Торги**.

---

## 2. Технологический стек

| Компонент | Технология | Обоснование |
|-----------|-----------|-------------|
| **Бэкенд** | Python 3.11+ / FastAPI | Асинхронный, быстрый, совместимость с pynspd |
| **БД** | PostgreSQL 16 + PostGIS | Геоданные, пространственные индексы, GIST |
| **Кэш** | Redis 7 | Кэш кадастровых запросов, сессии, очередь задач |
| **Фронтенд** | Next.js 15 + MapLibre GL JS | SSR, оптимизация, интерактивные карты |
| **Админка** | React Admin / Next.js admin | Кастомная админ-панель |
| **Очередь** | Celery + Redis | Фоновые задачи (импорт, обход кадастра) |
| **Аутентификация** | JWT + Keycloak или Auth0 | Multi-tenant, роли (admin, seller, buyer) |
| **Хранилище** | S3 (Minio / Yandex Object Storage) | Файлы, Excel, фото участков |

**Почему FastAPI + Next.js:**
- FastAPI async — быстрые запросы к внешним API (НСПД, Росреестр)
- Next.js — быстрый интерфейс, SSR для SEO, хорошая экосистема карт
- PostGIS — нативная работа с геометрией, пространственные запросы

---

## 3. Архитектура

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (Next.js)                 │
│  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐  │
│  │ Карта   │ │ Поиск/   │ │ Админ- │ │ Личный   │  │
│  │ MapLibre│ │ Фильтры  │ │ панель │ │ кабинет  │  │
│  └────┬────┘ └────┬─────┘ └────┬───┘ └────┬─────┘  │
└───────┼───────────┼────────────┼──────────┼─────────┘
        │           │            │          │
┌───────┴───────────┴────────────┴──────────┴─────────┐
│               API Gateway (FastAPI)                  │
│  ┌────────┐ ┌──────────┐ ┌────────┐ ┌───────────┐  │
│  │ Plots  │ │ Search   │ │ Auth   │ │ Import    │  │
│  │ API    │ │ API      │ │ API    │ │ API       │  │
│  └───┬────┘ └────┬─────┘ └───┬────┘ └─────┬─────┘  │
└───────┼───────────┼───────────┼────────────┼────────┘
        │           │           │            │
┌───────┴───────────┴───────────┴────────────┴────────┐
│              Service Layer (Python)                  │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐          │
│  │ Cadastre │ │ Market   │ │ Similar    │          │
│  │ Service  │ │ Service  │ │ Plots      │          │
│  └──────────┘ └──────────┘ └────────────┘          │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐          │
│  │ Import   │ │ Export   │ │ Geo Service│          │
│  │ Pipeline │ │ Service  │ │ (PostGIS)  │          │
│  └──────────┘ └──────────┘ └────────────┘          │
└─────────────────────────────────────────────────────┘
        │           │           │
┌───────┴───────────┴───────────┴────────────────────┐
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │PostgreSQL│  │  Redis   │  │   S3 (Minio)     │ │
│  │+ PostGIS │  │  Cache   │  │  Файлы/Фото      │ │
│  └──────────┘  └──────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────┘
        │           │           │
┌───────┴───────────┴───────────┴────────────────────┐
│           External Integrations                     │
│  ┌────────┐ ┌────────┐ ┌───────┐ ┌───────────┐   │
│  │НСПД/   │ │Росреестр│ │ГИС   │ │Yandex/    │   │
│  │ПКК     │ │        │ │Торги │ │Google API │   │
│  └────────┘ └────────┘ └───────┘ └───────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## 4. База данных (PostgreSQL + PostGIS)

### 4.1. Схема данных

```sql
-- Тенанты (продавцы/застройщики)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Пользователи
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'buyer')),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Коттеджные посёлки / НП
CREATE TABLE settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    name TEXT NOT NULL,
    description TEXT,
    geometry GEOMETRY(Polygon, 4326),  -- граница НП
    address TEXT,
    region TEXT,          -- регион РФ
    district TEXT,        -- район
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_settlements_geometry ON settlements USING GIST (geometry);

-- Участки на продажу (основная таблица)
CREATE TABLE plots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    settlement_id UUID REFERENCES settlements(id),
    cadastral_number TEXT UNIQUE NOT NULL,
    
    -- Данные из кадастра
    address TEXT,
    area_m2 FLOAT,
    category TEXT,            -- категория земель
    permitted_use TEXT,       -- ВРИ
    cadastral_value FLOAT,    -- кадастровая стоимость
    geometry GEOMETRY(Polygon, 4326),
    cad_unit TEXT,            -- кадастровый квартал
    cad_status TEXT,          -- статус участка в ЕГРН
    
    -- Коммерческие данные
    price FLOAT,
    price_per_hectare FLOAT,
    status TEXT NOT NULL DEFAULT 'free'
        CHECK (status IN ('free', 'reserved', 'booked', 'sold')),
    title TEXT,
    description TEXT,
    photos TEXT[],            -- ссылки на S3
    
    -- Метаданные
    metadata JSONB DEFAULT '{}',
    imported_from TEXT,       -- источник импорта
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_plots_geometry ON plots USING GIST (geometry);
CREATE INDEX idx_plots_cadastral ON plots (cadastral_number);
CREATE INDEX idx_plots_tenant_status ON plots (tenant_id, status);
CREATE INDEX idx_plots_price ON plots (price);
CREATE INDEX idx_plots_area ON plots (area_m2);
CREATE INDEX idx_plots_permitted_use ON plots (permitted_use);

-- История изменения статуса
CREATE TABLE plot_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plot_id UUID REFERENCES plots(id),
    old_status TEXT,
    new_status TEXT NOT NULL,
    changed_by UUID REFERENCES users(id),
    changed_at TIMESTAMPTZ DEFAULT now()
);

-- Запросы покупателей (лиды)
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    plot_id UUID REFERENCES plots(id),
    buyer_name TEXT,
    buyer_phone TEXT,
    buyer_email TEXT,
    message TEXT,
    status TEXT DEFAULT 'new',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Импортированные файлы
CREATE TABLE imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    source TEXT NOT NULL,       -- 'excel', 'google_sheets', 'yandex_table'
    file_url TEXT,             -- ссылка на оригинал
    import_data JSONB,         -- сырые данные
    status TEXT DEFAULT 'pending',
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- Кэш кадастровых данных
CREATE TABLE cadastre_cache (
    cadastral_number TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    geometry GEOMETRY(Polygon, 4326),
    fetched_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ
);
```

### 4.2. PostGIS индексы

- GIST на `geometry` всех таблиц с геометрией
- B-tree на `cadastral_number`, `tenant_id`, `status`, `price`, `area_m2`
- GiST на `metadata` для JSONB-поиска

---

## 5. API Endpoints (FastAPI)

### 5.1. Публичные (без авторизации)

```
GET  /api/v1/plots                  # Поиск участков (фильтры, пагинация, sorting)
GET  /api/v1/plots/{id}             # Детали участка
GET  /api/v1/plots/{id}/similar     # Похожие участки
GET  /api/v1/plots/geo              # GeoJSON для карты (с фильтрами)
GET  /api/v1/settlements            # Список НП/посёлков
GET  /api/v1/settlements/{id}       # Детали НП
GET  /api/v1/search/suggest         # Подсказки поиска (адреса, кадастры)
```

### 5.2. Для продавцов (требуют авторизации)

```
POST /api/v1/plots                  # Добавить участок
PUT  /api/v1/plots/{id}             # Обновить участок
PATCH /api/v1/plots/{id}/status     # Сменить статус (free/reserved/booked/sold)
DELETE /api/v1/plots/{id}           # Удалить участок

POST /api/v1/import/excel           # Загрузить Excel
POST /api/v1/import/google-sheets   # Импорт из Google Sheets
POST /api/v1/import/yandex-table    # Импорт из Яндекс Таблиц
GET  /api/v1/imports                # История импортов

GET  /api/v1/tenant/stats           # Статистика по участкам
```

### 5.3. Административные

```
GET    /api/v1/admin/tenants        # Список тенантов
POST   /api/v1/admin/tenants        # Создать тенанта
GET    /api/v1/admin/users          # Управление пользователями
POST   /api/v1/admin/cadastre/sync  # Принудительная синхронизация с кадастром
```

### 5.4. Интеграционные (internal)

```
GET  /api/v1/cadastre/{cn}          # Получить данные из Росреестра/НСПД
GET  /api/v1/cadastre/{cn}/geometry # Получить геометрию участка
POST /api/v1/cadastre/batch         # Пакетный запрос кадастровых данных
```

---

## 6. Интеграция с кадастровыми источниками

### 6.1. Источники данных

| Источник | Данные | Метод |
|----------|--------|-------|
| **НСПД (nspd.gov.ru)** | Геометрия участков, границы НП, зоны ПЗЗ, территориальные зоны, ограничения | HTTP API (через pynspd) |
| **Росреестр (rosreestr.gov.ru)** | Кадастровые номера, адреса, площадь, ВРИ, кадастровая стоимость | ПКК API |
| **ПКК (pkk.rosreestr.ru)** | Публичная кадастровая карта — геометрия, статусы | HTTP API |
| **ГИС Торги (torgi.gov.ru)** | Земельные лоты на торгах | REST API |

### 6.2. Паттерн интеграции

```
[Запрос] → Проверка cadastre_cache (Redis/Postgres)
    ↓ кэш устарел/отсутствует
    → Async запрос к НСПД (через pynspd)
    → Парсинг ответа → LandPlot
    → Сохранение в cadastre_cache + plots
    → Возврат результата
```

### 6.3. Фоновые задачи (Celery)

- `sync_cadastre_data(cn)` — обновить данные конкретного участка
- `batch_sync_settlement(settlement_id)` — синхронизировать все участки в НП
- `auto_discover_plots(settlement_id)` — найти новые участки по границе НП через НСПД
- `check_status_changes()` — проверка изменения статусов участков
- `import_file_process(import_id)` — обработка загруженного файла

---

## 7. Импорт данных

### 7.1. Поддерживаемые форматы

1. **Excel (.xlsx, .xls)**
2. **Google Sheets** (через REST API)
3. **Яндекс Таблицы** (через REST API)
4. **CSV**

### 7.2. Структура импорта (ожидаемые колонки)

| Колонка | Обязательно | Описание |
|---------|-------------|----------|
| `cadastral_number` | Да | Кадастровый номер участка |
| `price` | Да | Цена продажи |
| `title` | Нет | Название/заголовок |
| `description` | Нет | Описание |
| `settlement_name` | Нет | Название посёлка/НП |
| `status` | Нет | `free/reserved/booked/sold` |
| `photos` | Нет | Ссылки на фото |

### 7.3. Процесс импорта

1. Загрузка файла → сохранение в S3
2. Celery task: парсинг → валидация кадастровых номеров
3. Асинхронное обогащение из НСПД (геометрия, площадь, ВРИ)
4. Сохранение в БД
5. Отчёт об ошибках (невалидные номера, не найденные участки)

### 7.4. Интеграция с Google / Яндекс таблицами

```
1. Пользователь настраивает интеграцию (OAuth 2.0)
2. Указывает URL таблицы / spreadsheet ID
3. Периодическая синхронизация (каждые N минут)
4. Изменения в таблице → автоматическое обновление участков
```

---

## 8. Фронтенд (Next.js + MapLibre)

### 8.1. Страницы

| Страница | Описание |
|----------|----------|
| `/` | Карта со всеми участками + поиск |
| `/plots` | Список участков (таблица/сетка) |
| `/plots/{id}` | Детальная страница участка |
| `/settlements` | Список посёлков/НП |
| `/settlements/{id}` | Карта посёлка + список участков |
| `/map` | Полноэкранная карта |
| `/admin` | Админ-панель (дашборд) |
| `/admin/plots` | Управление участками |
| `/admin/import` | Импорт данных |
| `/admin/settings` | Настройки тенанта |
| `/auth/login` | Вход |
| `/auth/register` | Регистрация |

### 8.2. Карта (MapLibre GL JS)

Функциональность карты:

```
Слои (с возможностью вкл/выкл):
├── 🗺 Базовый слой (схема/спутник/гибрид)
├── 📌 Участки на продажу (цвет по статусу)
│   ├── green  — свободен
│   ├── yellow — в резерве
│   ├── orange — забронирован
│   └── red    — продан
├── 📋 Кадастровые кварталы
├── 🏘 Границы НП/посёлков
├── 🏗 Зоны ПЗЗ (территориальные зоны)
├── 🚧 ЗОУИТ (зоны с ограничениями)
├── 🛰 Ортофотоплан
├── 🌊 Карта высот / рельеф
└── 🏠 Виртуальные туры (если есть)
```

Элементы управления:
- Поиск по кадастровому номеру, адресу, посёлку
- Фильтры: цена (min/max), площадь, ВРИ (ИЖС/ЛПХ/СНТ/ДНП), статус
- Popup при клике на участок: фото, цена, площадь, кадастровый номер
- Кнопка «На весь экран»
- Фокус на участок (zoom)
- Сравнение участков

### 8.3. Карточка участка

```
┌──────────────────────────┐
│        [Фото]            │
│  Кадастровый номер       │
│  Адрес                   │
│  Площадь: 10 соток       │
│  ВРИ: ИЖС               │
│  Категория: ЗНП          │
│  ─────────────────────── │
│  Цена: 1 500 000 ₽       │
│  ─────────────────────── │
│  Статус: 🟢 Свободен     │
│  ─────────────────────── │
│  [Получить консультацию] │
│  [Похожие участки]       │
│  [Показать на карте]     │
└──────────────────────────┘
```

---

## 9. Multi-tenant архитектура

### 9.1. Модель данных

- Таблица `tenants` — каждый застройщик/агентство
- Все данные привязаны к `tenant_id`
- Изоляция на уровне БД (Row-Level Security через tenant_id)

### 9.2. Роли

| Роль | Права |
|------|-------|
| `superadmin` | Управление всеми тенантами, системные настройки |
| `admin` (тенант) | Управление участками, пользователями, импортом |
| `manager` | Добавление/редактирование участков, работа с лидами |
| `buyer` | Просмотр, поиск, отправка заявок |
| `api` | API-доступ для интеграций |

### 9.3. Белый ярлык (White Label)

- Каждый тенант может иметь свой домен
- Кастомный логотип, цвета, контакты
- Отдельная страница-витрина: `tenant.landsearch.ru`

---

## 10. Этапы разработки

### Phase 1: MVP (2-3 недели)
- [x] Настройка проекта FastAPI + PostgreSQL + PostGIS
- [x] Модели данных, миграции (Alembic)
- [x] Базовое API для участков (CRUD)
- [x] Импорт Excel/CSV
- [x] Интеграция с НСПД (обогащение кадастровых данных)
- [x] Простая карта (MapLibre) с отображением участков
- [x] Авторизация (JWT)

### Phase 2: Расширение (2-3 недели)
- [x] Полноэкранная карта со слоями
- [x] Google Sheets / Яндекс Таблицы интеграция
- [x] Поиск с фильтрами (цена, площадь, ВРИ, статус)
- [x] Похожие участки (на основе кадастрового квартала, ВРИ, площади)
- [x] Админ-панель (дашборд, управление)
- [x] Статусы участков (free/reserved/booked/sold)
- [x] Аналитические данные по посёлку (сколько свободно, занято)

### Phase 3: SaaS & Масштабирование (3-4 недели)
- [x] Multi-tenant (регистрация продавцов)
- [x] White Label для застройщиков
- [x] ГИС Торги интеграция (земельные аукционы)
- [x] ПЗЗ зоны на карте (территориальные зоны)
- [x] ЗОУИТ (ограничения)
- [x] Виртуальные туры / фото
- [x] Лиды и CRM для продавцов

### Phase 4: Монетизация (2-3 недели)
- [x] Тарифы (Free / Pro / Enterprise)
- [x] Ограничения по количеству участков
- [x] API для партнёров
- [x] Биллинг (YooKassa / Stripe)
- [x] Аналитика для продавцов (просмотры, лиды)

---

## 11. Примерная структура проекта

```
landsearch/
├── backend/
│   ├── app/
│   │   ├── api/              # FastAPI роуты
│   │   │   ├── v1/
│   │   │   │   ├── plots.py
│   │   │   │   ├── settlements.py
│   │   │   │   ├── search.py
│   │   │   │   ├── import/
│   │   │   │   │   ├── excel.py
│   │   │   │   │   ├── google_sheets.py
│   │   │   │   │   └── yandex_table.py
│   │   │   │   ├── admin.py
│   │   │   │   ├── auth.py
│   │   │   │   └── cadastre.py
│   │   │   └── deps.py       # DI зависимости
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── security.py
│   │   │   └── database.py
│   │   ├── models/           # SQLAlchemy модели
│   │   │   ├── plot.py
│   │   │   ├── tenant.py
│   │   │   ├── user.py
│   │   │   ├── settlement.py
│   │   │   ├── lead.py
│   │   │   └── import.py
│   │   ├── schemas/          # Pydantic схемы
│   │   ├── services/
│   │   │   ├── cadastre.py   # НСПД/Росреестр интеграция
│   │   │   ├── geo.py        # PostGIS операции
│   │   │   ├── similar.py    # Поиск аналогов
│   │   │   ├── importer/     # Импорт данных
│   │   │   ├── market.py     # Рыночные цены
│   │   │   └── export.py     # Экспорт
│   │   ├── tasks/            # Celery задачи
│   │   └── utils/
│   ├── alembic/              # Миграции БД
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── app/                  # Next.js App Router
│   │   ├── page.tsx          # Главная / карта
│   │   ├── plots/
│   │   ├── admin/
│   │   ├── auth/
│   │   └── map/
│   ├── components/
│   │   ├── map/              # MapLibre компоненты
│   │   ├── ui/               # UI kit
│   │   └── admin/            # Админ-панель
│   ├── lib/
│   │   ├── api.ts            # API клиент
│   │   └── map-styles.ts     # Стили карты
│   └── package.json
│
├── docker-compose.yml
├── nginx.conf
└── README.md
```

---

## 12. Ключевые функции для быстрого запуска (MVP)

1. **Загрузка Excel с кадастровыми номерами**
   → Автоматическое получение геометрии из НСПД
   → Отображение на карте

2. **Карта с участками** (MapLibre)
   - Цвет по статусу
   - Клик → информация
   - Поиск по кадастровому номеру

3. **Похожие участки**
   - На основе кадастрового квартала
   - Анализ ВРИ, площади, цены за сотку

4. **Статусы участков**
   - Свободен / В резерве / Забронирован / Продан
   - История изменений

5. **Импорт из Google Sheets**
   - OAuth 2.0
   - Автосинхронизация

---

## 13. Пример использования (user story)

### Продавец (застройщик):
1. Регистрируется → создаётся тенант
2. Загружает Excel со списком участков (кадастровые номера + цены)
3. Система автоматически подтягивает границы, площадь, ВРИ из НСПД
4. Участки появляются на карте с ценой и статусом "свободен"
5. При бронировании → меняет статус в админке (или синхронизация с Google Sheets)
6. Получает лиды от покупателей

### Покупатель:
1. Заходит на сайт
2. Видит карту с участками, фильтрует по цене/площади/ВРИ
3. Нажимает на участок → видит границы, фото, цену
4. Находит похожие участки
5. Отправляет заявку → продавец получает уведомление

---

## 14. Оценка ресурсов

- **Сервер**: 2 vCPU, 4 GB RAM (начало), 4 vCPU, 8 GB RAM (production)
- **БД**: PostgreSQL 16 + PostGIS (отдельно или на том же сервере)
- **Redis**: 512 MB (кэш + Celery)
- **S3**: Minio / Yandex Object Storage (файлы, фото)
- **Домен + SSL**: через Let's Encrypt / nginx
