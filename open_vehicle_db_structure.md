# Open Vehicle DB SQLite Structure

Database file:

`open_vehicle.db`

## Tables

- `makes`
- `make_years`
- `models`
- `model_years`
- `styles`
- `style_years`
- `stats`

## `makes`

Stores vehicle makes.

```sql
CREATE TABLE makes (
  id INTEGER PRIMARY KEY,
  source_make_id INTEGER UNIQUE NOT NULL,
  make_name TEXT NOT NULL,
  make_slug TEXT NOT NULL UNIQUE,
  first_year INTEGER NOT NULL,
  last_year INTEGER NOT NULL
);
```

## `make_years`

Stores the years available for each make.

```sql
CREATE TABLE make_years (
  make_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  FOREIGN KEY (make_id) REFERENCES makes(id),
  PRIMARY KEY (make_id, year)
);
```

## `models`

Stores vehicle models for each make.

```sql
CREATE TABLE models (
  id INTEGER PRIMARY KEY,
  source_model_id INTEGER NOT NULL,
  make_id INTEGER NOT NULL,
  model_name TEXT NOT NULL,
  vehicle_type TEXT,
  FOREIGN KEY (make_id) REFERENCES makes(id),
  UNIQUE (make_id, source_model_id),
  UNIQUE (make_id, model_name)
);
```

## `model_years`

Stores the years available for each model.

```sql
CREATE TABLE model_years (
  model_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  FOREIGN KEY (model_id) REFERENCES models(id),
  PRIMARY KEY (model_id, year)
);
```

## `styles`

Stores vehicle versions or trims.

```sql
CREATE TABLE styles (
  id INTEGER PRIMARY KEY,
  make_id INTEGER NOT NULL,
  model_id INTEGER NOT NULL,
  style_name TEXT NOT NULL,
  FOREIGN KEY (make_id) REFERENCES makes(id),
  FOREIGN KEY (model_id) REFERENCES models(id),
  UNIQUE (make_id, model_id, style_name)
);
```

## `style_years`

Stores the years available for each vehicle version.

```sql
CREATE TABLE style_years (
  style_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  FOREIGN KEY (style_id) REFERENCES styles(id),
  PRIMARY KEY (style_id, year)
);
```

## `stats`

Stores metadata and generated counts.

```sql
CREATE TABLE stats (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

## Relationships

```text
makes.id
  -> make_years.make_id
  -> models.make_id
  -> styles.make_id

models.id
  -> model_years.model_id
  -> styles.model_id

styles.id
  -> style_years.style_id
```

## Indexes

```sql
CREATE INDEX idx_makes_name
ON makes(make_name);

CREATE INDEX idx_makes_year_range
ON makes(first_year, last_year);

CREATE INDEX idx_make_years_year_make
ON make_years(year, make_id);

CREATE INDEX idx_model_years_year_model
ON model_years(year, model_id);

CREATE INDEX idx_models_make_name
ON models(make_id, model_name);

CREATE INDEX idx_style_years_year_style
ON style_years(year, style_id);

CREATE INDEX idx_styles_make_model_name
ON styles(make_id, model_id, style_name);
```

## Main Search Flow

The intended Node.js search flow is:

1. Select a year.
2. List all makes available for that year.
3. Select a make.
4. List all models available for that make and year.
5. Select a model.
6. List all versions available for that year, make, and model.

## Queries

### Makes by year

```sql
SELECT ma.id, ma.make_name, ma.make_slug
FROM makes ma
JOIN make_years my ON my.make_id = ma.id
WHERE my.year = ?
ORDER BY ma.make_name;
```

### Models by year and make

```sql
SELECT mo.id, mo.model_name, mo.vehicle_type
FROM models mo
JOIN model_years my ON my.model_id = mo.id
WHERE mo.make_id = ?
  AND my.year = ?
ORDER BY mo.model_name;
```

### Versions by year, make, and model

```sql
SELECT s.id, s.style_name
FROM styles s
JOIN style_years sy ON sy.style_id = s.id
WHERE s.make_id = ?
  AND s.model_id = ?
  AND sy.year = ?
ORDER BY s.style_name;
```

## Example

For year `2020`, make `TOYOTA`, and model `4-Runner`, example versions include:

- `4RUNNER 4DR SUV 4WD LIMITED V6`
- `4RUNNER 4DR SUV 4WD SR5 V6`
- `4RUNNER 4DR SUV 4WD TRAIL EDITION V6`

## Regenerate Database

Run this command from the project directory:

```bash
python build_sqlite_db.py
```
