---
name: crud-generation
description: >-
  Generate insert/update/select/delete stored procedures for a SQL Server table
  following this project's conventions. Trigger when the user says "Generate CRUD
  for <table>", "make stored procs for <table>", or similar.
---

# CRUD generation

When the user asks to **"Generate CRUD for `<table>`"**, produce four
`CREATE OR ALTER PROCEDURE` scripts — insert, update, select, delete — by applying the
rules below. These rules are a faithful distillation of `crud_generation.sql`, the T-SQL
meta-script that generates the same procedures by reading `INFORMATION_SCHEMA`. That script
is the source of truth; when a case here is ambiguous, re-derive it from the script.

Emit clean, ready-to-run T-SQL with real line breaks (not the escaped `\r\n` / `CONCAT`
form the meta-script uses internally).

## 1. Inputs you need

To generate procedures you must know, for the target table:

- column name, data type, and size / precision / scale
- which column (if any) is an **IDENTITY** column
- which columns form the **primary / unique key**
- the table's schema (default `dbo` if unspecified)

If the user did not provide a `CREATE TABLE` statement or column list, **ask for it or
locate it in the repo first. Do not invent columns.**

## 2. Naming & schema

- Procedure name = `crd.` + the table name with `tbl` replaced by `sp` + suffix.
  - suffix is one of `_insert`, `_update`, `_select`, `_delete`.
  - e.g. `tbl_widget` → `crd.sp_widget_insert`.
- DML statements target the **real** table: `[schema].[table]` (e.g. `dbo.tbl_widget`).
- Every procedure's first parameter is `@user_id VARCHAR(20)`.

## 3. Header & logging (every proc)

Lead each script with:

```sql
SET QUOTED_IDENTIFIER ON
GO
SET ANSI_NULLS ON
GO
```

Open the body with a flowerbox comment, then the logging line:

```sql
CREATE OR ALTER PROCEDURE crd.sp_widget_insert (@user_id VARCHAR(20), ...params...) AS BEGIN
    /************************************************
    Procedure Name: crd.sp_widget_insert
            Author: Douglas Bowerman
       Create Date: 06/04/2026
           Purpose: 

    Params:
        @user_id                   = myId of the user calling the proc (for logging purposes)
        @<col>                     = represents the <col> to <verb> records
        ...

    Notes:
        @user_id is required.

    Revised | Author  | Notes

    ************************************************/
    SET NOCOUNT ON; EXECUTE [crd].[procedure_history_insert] @user_id = @user_id, @proc_id = @@PROCID;
```

- `Create Date` is today's date in `MM/DD/YYYY` (SQL style 101).
- One param doc line per non-audit column: `        @<col>` then enough spaces to reach
  25 characters after the `@`, then `= represents the <col> to <verb> records`.
  `<verb>` is `insert` / `update` / `select` / `delete` to match the procedure.
- The `@user_id` doc line is fixed boilerplate (shown above).

## 4. Audit columns

`created_date`, `created_by`, `updated_date`, `updated_by` are **never** parameters, local
declares, or local sets. They are written automatically:

- **INSERT** values: `created_date` & `updated_date` → `GETDATE()`; `created_by` &
  `updated_by` → `@user_id`.
- **UPDATE** SET clause: `updated_date = GETDATE()`, `updated_by = @user_id`;
  `created_date` / `created_by` are omitted entirely.

## 5. Parameter typing — string in, parse later

Scalar parameters are received as strings and default to `NULL`, so callers can pass empty
strings. Rules per column:

- Numeric/date/guid types — `TINYINT, SMALLINT, INT, BIGINT, DECIMAL, NUMERIC, DATETIME,
  UNIQUEIDENTIFIER` — are declared as **`VARCHAR(<size>) = NULL`**.
- **`BIT`** is declared as `BIT` — no size and **no default** (faithful quirk of the script).
- All other types keep their own type and size: `<type>(<size>) = NULL`.
- `<size>` = `CHARACTER_MAXIMUM_LENGTH`, else `NUMERIC_PRECISION`, else `50`; a size of
  `-1` (i.e. `MAX`) renders as `MAX`.

## 6. Local variables — typed shadow vars

For each parameter column, declare `@<col>_local` with the column's **real** type, then set
it from the string parameter:

- Declare:
  - `DECIMAL` / `NUMERIC` → `<type>(<precision>, <scale>)` (e.g. `NUMERIC(28, 15)`)
  - `DATETIME` / `UNIQUEIDENTIFIER` / `BIT` → the bare type (no size)
  - other numerics (`TINYINT…BIGINT`) → the bare type
  - strings/other → `<type>(<size>)` (same size rule as §5)
- Set:
  - numeric (`TINYINT, SMALLINT, INT, BIGINT, DECIMAL, NUMERIC`) →
    `SET @<col>_local = TRY_PARSE(NULLIF(@<col>, '') AS <type>)` (`DECIMAL` / `NUMERIC`
    keep `(p, s)`)
  - `DATETIME` / `UNIQUEIDENTIFIER` →
    `SET @<col>_local = CONVERT(<type>, NULLIF(@<col>, ''))`
  - everything else → `SET @<col>_local = NULLIF(@<col>, '')`

## 7. Identity columns

- Excluded from the INSERT column list and the VALUES list.
- After the INSERT, capture the new key into its local so the trailing SELECT can use it:
  `SET @<identity>_local = SCOPE_IDENTITY();`

## 8. Key columns (primary / unique key)

- **WHERE for insert / update / delete** (exact match):
  `([<col>] = @<col>_local) AND ...`
- **WHERE for select** (null param matches everything):
  `([<col>] = @<col>_local OR @<col>_local IS NULL) AND ...`
- If the table has **no key**, select and delete emit **no WHERE clause**.
- Select and delete procedures take **only the key columns** as parameters (same
  string-coercion rules from §5/§6) and append an `EXECUTE` example line:
  `GO EXECUTE sel.<table_name> @user_id = 'M84423', @<keycol> = '';`
  (Note: the example line uses the `sel.` schema and the raw table name — faithful quirk.)

## 9. Procedure body order

- **INSERT**: header → flowerbox → logging → declare locals → set locals →
  `INSERT INTO <schema>.<table> (<non-identity cols>) VALUES (<locals / audit defaults>)` →
  capture identity → `SELECT * FROM <schema>.<table> WHERE <keys>` → `END; GO`
- **UPDATE**: header → flowerbox → logging → declare locals → set locals →
  `UPDATE <schema>.<table> SET [c] = ISNULL(@c_local, [c]), ..., updated_date = GETDATE(),
  updated_by = @user_id WHERE <keys>` →
  `SELECT * FROM <schema>.<table> WHERE <keys>` → `END; GO`
  (key columns and `created_*` are excluded from the SET list.)
- **SELECT**: header → flowerbox → logging → declare key locals → set key locals →
  `SELECT * FROM <schema>.<table> [WHERE <keys-with-OR-IS-NULL>]` → `END; GO`
- **DELETE**: same as SELECT but `DELETE FROM <schema>.<table> WHERE <keys>` (exact match).

## 10. Worked example

Given:

```sql
CREATE TABLE dbo.tbl_widget (
    widget_id    INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    name         VARCHAR(50)       NULL,
    qty          INT               NULL,
    created_date DATETIME          NULL,
    created_by   VARCHAR(20)       NULL,
    updated_date DATETIME          NULL,
    updated_by   VARCHAR(20)       NULL
);
```

`Generate CRUD for tbl_widget` produces:

### Insert

```sql
SET QUOTED_IDENTIFIER ON
GO
SET ANSI_NULLS ON
GO
CREATE OR ALTER PROCEDURE crd.sp_widget_insert (@user_id VARCHAR(20), @widget_id VARCHAR(10) = NULL, @name VARCHAR(50) = NULL, @qty VARCHAR(10) = NULL) AS BEGIN
    /************************************************
    Procedure Name: crd.sp_widget_insert
            Author: Douglas Bowerman
       Create Date: 06/04/2026
           Purpose: 

    Params:
        @user_id                   = myId of the user calling the proc (for logging purposes)
        @widget_id                 = represents the widget_id to insert records
        @name                      = represents the name to insert records
        @qty                       = represents the qty to insert records

    Notes:
        @user_id is required.

    Revised | Author  | Notes

    ************************************************/
    SET NOCOUNT ON; EXECUTE [crd].[procedure_history_insert] @user_id = @user_id, @proc_id = @@PROCID;
    DECLARE @widget_id_local INT; DECLARE @name_local VARCHAR(50); DECLARE @qty_local INT;
    SET @widget_id_local = TRY_PARSE(NULLIF(@widget_id, '') AS INT); SET @name_local = NULLIF(@name, ''); SET @qty_local = TRY_PARSE(NULLIF(@qty, '') AS INT);
    INSERT INTO dbo.tbl_widget ([name], [qty], [created_date], [created_by], [updated_date], [updated_by]) VALUES (@name_local, @qty_local, GETDATE(), @user_id, GETDATE(), @user_id) ;
    SET @widget_id_local = SCOPE_IDENTITY(); SELECT * FROM dbo.tbl_widget WHERE ([widget_id] = @widget_id_local);
END;
GO
```

### Update

```sql
SET QUOTED_IDENTIFIER ON
GO
SET ANSI_NULLS ON
GO
CREATE OR ALTER PROCEDURE crd.sp_widget_update (@user_id VARCHAR(20), @widget_id VARCHAR(10) = NULL, @name VARCHAR(50) = NULL, @qty VARCHAR(10) = NULL) AS BEGIN
    /************************************************
    Procedure Name: crd.sp_widget_update
            Author: Douglas Bowerman
       Create Date: 06/04/2026
           Purpose: 

    Params:
        @user_id                   = myId of the user calling the proc (for logging purposes)
        @widget_id                 = represents the widget_id to update records
        @name                      = represents the name to update records
        @qty                       = represents the qty to update records

    Notes:
        @user_id is required.

    Revised | Author  | Notes

    ************************************************/
    SET NOCOUNT ON; EXECUTE [crd].[procedure_history_insert] @user_id = @user_id, @proc_id = @@PROCID;
    DECLARE @widget_id_local INT; DECLARE @name_local VARCHAR(50); DECLARE @qty_local INT;
    SET @widget_id_local = TRY_PARSE(NULLIF(@widget_id, '') AS INT); SET @name_local = NULLIF(@name, ''); SET @qty_local = TRY_PARSE(NULLIF(@qty, '') AS INT);
    UPDATE dbo.tbl_widget SET [name] = ISNULL(@name_local, [name]), [qty] = ISNULL(@qty_local, [qty]), updated_date = GETDATE(), updated_by = @user_id WHERE ([widget_id] = @widget_id_local);
    SELECT * FROM dbo.tbl_widget WHERE ([widget_id] = @widget_id_local);
END;
GO
```

### Select

```sql
SET QUOTED_IDENTIFIER ON
GO
SET ANSI_NULLS ON
GO
CREATE OR ALTER PROCEDURE crd.sp_widget_select (@user_id VARCHAR(20), @widget_id VARCHAR(10) = NULL) AS BEGIN
    /************************************************
    Procedure Name: crd.sp_widget_select
            Author: Douglas Bowerman
       Create Date: 06/04/2026
           Purpose: 

    Params:
        @user_id                   = myId of the user calling the proc (for logging purposes)
        @widget_id                 = represents the widget_id to select records

    Notes:
        @user_id is required.

    Revised | Author  | Notes

    ************************************************/
    SET NOCOUNT ON; EXECUTE [crd].[procedure_history_insert] @user_id = @user_id, @proc_id = @@PROCID;
    DECLARE @widget_id_local INT; SET @widget_id_local = TRY_PARSE(NULLIF(@widget_id, '') AS INT); SELECT * FROM dbo.tbl_widget WHERE ([widget_id] = @widget_id_local OR @widget_id_local IS NULL) END;
GO
GO EXECUTE sel.tbl_widget @user_id = 'M84423', @widget_id = '';
```

### Delete

```sql
SET QUOTED_IDENTIFIER ON
GO
SET ANSI_NULLS ON
GO
CREATE OR ALTER PROCEDURE crd.sp_widget_delete (@user_id VARCHAR(20), @widget_id VARCHAR(10) = NULL) AS BEGIN
    /************************************************
    Procedure Name: crd.sp_widget_delete
            Author: Douglas Bowerman
       Create Date: 06/04/2026
           Purpose: 

    Params:
        @user_id                   = myId of the user calling the proc (for logging purposes)
        @widget_id                 = represents the widget_id to delete records

    Notes:
        @user_id is required.

    Revised | Author  | Notes

    ************************************************/
    SET NOCOUNT ON; EXECUTE [crd].[procedure_history_insert] @user_id = @user_id, @proc_id = @@PROCID;
    DECLARE @widget_id_local INT; SET @widget_id_local = TRY_PARSE(NULLIF(@widget_id, '') AS INT); DELETE FROM dbo.tbl_widget WHERE ([widget_id] = @widget_id_local) END;
GO
GO EXECUTE sel.tbl_widget @user_id = 'M84423', @widget_id = '';
```

## 11. Source of truth

`crud_generation.sql` is authoritative. If you hit a data type, default, or edge case not
covered above, re-derive the behavior from that script rather than guessing.
